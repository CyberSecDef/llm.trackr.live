<?php

namespace App\Jobs;

use App\Enums\RunStatus;
use App\Events\Runs\RunStarted;
use App\Models\ApiKey;
use App\Models\Run;
use App\Services\Llm\Exceptions\LlmClientException;
use App\Services\Llm\LlmClientFactory;
use App\Services\Llm\LlmTokenChunk;
use App\Services\Runs\RunEventEmitter;
use App\Services\Threads\Exceptions\NoApiKeyException;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Drives a Pending Run through its streaming lifecycle. Queued by the
 * HTTP run-submission controller (M6 chunk 4) once the Run row has
 * been persisted.
 *
 * Flow per run:
 *   1. Refresh from DB; bail if not Pending (defensive against retries).
 *   2. Resolve user's API key for the model's vendor — meta→together
 *      fallback mirrors RunService::resolveApiKey so the streaming side
 *      stays consistent with submission-time validation.
 *   3. Flip status to Streaming and broadcast RunStarted.
 *   4. Iterate `client->stream(...)`; for each LlmTokenChunk, dispatch
 *      the events that RunEventEmitter derives + append to token_log
 *      + concatenate output_text.
 *   5. Clean finish → persist final usage/cost/duration + broadcast
 *      RunCompleted. Vendor failure → persist partial state +
 *      broadcast RunErrored.
 *
 * Events use ShouldBroadcastNow so each broadcast fires from within
 * this worker process — no second queue round-trip, ordering preserved
 * for the per-token cascade.
 *
 * Cost estimation pulls pricing from `parameters.model_snapshot` (set
 * by RunService at submit time) rather than re-querying the LlmModel,
 * so a price change between submit + execute doesn't retroactively
 * rewrite a run's recorded cost. Returns null when either price field
 * is absent in the snapshot.
 */
class StreamRunJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(public readonly Run $run) {}

    public function handle(LlmClientFactory $clientFactory): void
    {
        $this->run->refresh();
        $this->run->load(['model', 'user']);

        if ($this->run->status !== RunStatus::Pending) {
            // A retry after partial success — never re-stream a run that
            // has already moved past Pending. The terminal state is the
            // canonical record; further work would corrupt it.
            return;
        }

        $emitter = new RunEventEmitter($this->run);

        try {
            $apiKey = $this->resolveApiKey();
            $client = $clientFactory->clientFor($this->run->model->vendor);
        } catch (Throwable $e) {
            $message = $this->friendlyError($e);
            $this->run->update([
                'status' => RunStatus::Error,
                'error_message' => $message,
            ]);
            event($emitter->erroredEvent($message));

            return;
        }

        $this->run->update(['status' => RunStatus::Streaming]);
        event(new RunStarted($this->run));

        $tokenLog = [];
        $outputText = '';
        $latestUsage = null;
        $tokenIndex = 0;
        $startedAt = microtime(true);

        try {
            foreach ($client->stream(
                $apiKey,
                $this->run->model->name,
                $this->run->prompt ?? '',
                $this->run->parameters ?? [],
                $this->run->conversation_history ?? [],
            ) as $chunk) {
                /** @var LlmTokenChunk $chunk */
                $tMs = (int) round((microtime(true) - $startedAt) * 1000);

                if ($chunk->text !== '') {
                    $outputText .= $chunk->text;
                    $tokenLog[] = [
                        'token' => $chunk->text,
                        'index' => $tokenIndex,
                        't_ms' => $tMs,
                        'logprobs' => $chunk->logprobs,
                    ];
                    // Incremental persistence so the SSE fallback route
                    // (chunk 5) can observe in-flight progress without a
                    // message broker. The terminal write below still runs
                    // — this is purely additive. ~one UPDATE per token at
                    // typical 50 tok/s; tolerable for SQLite in WAL mode
                    // and Postgres at our scale.
                    $this->run->update([
                        'output_text' => $outputText,
                        'token_log' => $tokenLog,
                    ]);
                }

                foreach ($emitter->eventsForChunk($chunk, $tokenIndex, $tMs) as $event) {
                    event($event);
                }

                if ($chunk->usage !== null) {
                    $latestUsage = $chunk->usage;
                }

                if ($chunk->text !== '') {
                    $tokenIndex++;
                }
            }
        } catch (Throwable $e) {
            $message = $this->friendlyError($e);
            $partialOutput = $outputText !== '' ? $outputText : null;
            $this->run->update([
                'status' => RunStatus::Error,
                'error_message' => $message,
                'output_text' => $partialOutput,
                'token_log' => $tokenLog !== [] ? $tokenLog : null,
                'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
                'output_tokens' => $tokenIndex,
            ]);
            event($emitter->erroredEvent($message, $partialOutput));

            return;
        }

        $apiKey->touchUsed();

        $durationMs = (int) round((microtime(true) - $startedAt) * 1000);
        $inputTokens = (int) ($latestUsage['input_tokens'] ?? 0);
        $outputTokens = (int) ($latestUsage['output_tokens'] ?? $tokenIndex);
        $tps = $durationMs > 0
            ? round($outputTokens / ($durationMs / 1000.0), 2)
            : 0.0;
        $cost = $this->estimateCost($inputTokens, $outputTokens);

        $this->run->update([
            'status' => RunStatus::Complete,
            'output_text' => $outputText,
            'token_log' => $tokenLog,
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
            'duration_ms' => $durationMs,
            'tokens_per_second' => $tps,
            'estimated_cost' => $cost,
        ]);

        event($emitter->completedEvent($inputTokens, $outputTokens, $durationMs, $cost));
    }

    private function resolveApiKey(): ApiKey
    {
        $user = $this->run->user;
        $vendor = $this->run->model->vendor;

        $key = $user->apiKeys()->where('vendor', $vendor)->first();
        if ($key === null && $vendor === 'meta') {
            $key = $user->apiKeys()->where('vendor', 'together')->first();
        }
        if ($key === null) {
            throw new NoApiKeyException($vendor);
        }

        return $key;
    }

    /**
     * Map an exception to a user-facing message. Vendor-categorized
     * errors (InvalidApiKey, VendorRateLimited, etc.) already carry
     * intentional copy; bare throwables get a generic surface so we
     * don't leak internals.
     */
    private function friendlyError(Throwable $e): string
    {
        if ($e instanceof LlmClientException) {
            return $e->getMessage();
        }
        if ($e instanceof NoApiKeyException) {
            return $e->getMessage();
        }

        return 'Streaming run failed: ' . $e->getMessage();
    }

    private function estimateCost(int $inputTokens, int $outputTokens): ?float
    {
        $snapshot = $this->run->parameters['model_snapshot'] ?? [];
        $inputPrice = $snapshot['pricing_input_per_million'] ?? null;
        $outputPrice = $snapshot['pricing_output_per_million'] ?? null;
        if ($inputPrice === null || $outputPrice === null) {
            return null;
        }

        return round(
            ($inputTokens / 1_000_000) * (float) $inputPrice
            + ($outputTokens / 1_000_000) * (float) $outputPrice,
            6,
        );
    }
}
