<?php

namespace App\Services\Runs;

use App\Events\Runs\LayerAdvanced;
use App\Events\Runs\MoeRouted;
use App\Events\Runs\RunCompleted;
use App\Events\Runs\RunErrored;
use App\Events\Runs\TokenReceived;
use App\Models\Run;
use App\Services\Llm\LlmTokenChunk;

/**
 * Translates raw `LlmTokenChunk`s from the vendor-client stream into
 * a deterministic sequence of broadcast events. Used by StreamRunJob
 * (M6 chunk 3) — for each chunk yielded by the vendor, call
 * `eventsForChunk()` and dispatch each returned event.
 *
 * Per token, this always emits TokenReceived + LayerAdvanced. For
 * MoE models (architecture_type='moe' in the run's model snapshot)
 * it additionally emits MoeRouted with deterministically-selected
 * experts.
 *
 * Determinism: MoE expert selection is a function of (run.id,
 * token_index) only — replays produce identical animations per
 * SPEC §10.1. The hash-based PRNG is intentionally simple: it's
 * not for production routing, just for the illustrative animation
 * since no proprietary MoE vendor exposes real router logits.
 */
class RunEventEmitter
{
    public function __construct(private readonly Run $run) {}

    /**
     * Per-chunk events. Returned as an ordered list so the caller
     * can broadcast them in sequence — TokenReceived first so the
     * frontend has the new text before the cascade event fires.
     *
     * @return list<object>
     */
    public function eventsForChunk(LlmTokenChunk $chunk, int $tokenIndex, int $tMs): array
    {
        $events = [];

        $events[] = new TokenReceived(
            run: $this->run,
            token: $chunk->text,
            index: $tokenIndex,
            tMs: $tMs,
            logprobs: $chunk->logprobs,
            isFinal: $chunk->isFinal,
        );

        $events[] = new LayerAdvanced(
            run: $this->run,
            tokenIndex: $tokenIndex,
            totalLayers: $this->modelSnapshot('layers'),
        );

        if ($this->isMoe()) {
            $experts = $this->expertsForToken($tokenIndex);
            $scores = $this->scoresFor($experts);
            $events[] = new MoeRouted(
                run: $this->run,
                tokenIndex: $tokenIndex,
                experts: $experts,
                scores: $scores,
            );
        }

        return $events;
    }

    /**
     * The terminal "stream finished cleanly" event. StreamRunJob
     * computes the final usage from the cumulative chunk usage and
     * calls this once after the loop.
     */
    public function completedEvent(
        int $inputTokens,
        int $outputTokens,
        int $durationMs,
        ?float $estimatedCost = null,
    ): RunCompleted {
        $tps = $durationMs > 0
            ? round($outputTokens / ($durationMs / 1000.0), 2)
            : 0.0;

        return new RunCompleted(
            run: $this->run,
            inputTokens: $inputTokens,
            outputTokens: $outputTokens,
            durationMs: $durationMs,
            tokensPerSecond: $tps,
            estimatedCost: $estimatedCost,
        );
    }

    public function erroredEvent(string $message, ?string $partialOutput = null): RunErrored
    {
        return new RunErrored(
            run: $this->run,
            message: $message,
            partialOutput: $partialOutput,
        );
    }

    private function isMoe(): bool
    {
        return $this->modelSnapshot('architecture_type') === 'moe';
    }

    private function modelSnapshot(string $key): mixed
    {
        return $this->run->parameters['model_snapshot'][$key] ?? null;
    }

    /**
     * Deterministically pick top-k expert IDs for this token.
     * Seeded by (run.id, token_index) so replays match. Uses SHA-256
     * bytes as the entropy source — overkill for the use case but
     * stateless and fast enough at typical token counts.
     *
     * @return list<int>
     */
    private function expertsForToken(int $tokenIndex): array
    {
        $expertCount = (int) ($this->modelSnapshot('moe_experts') ?? 8);
        $active = (int) ($this->modelSnapshot('moe_active_experts') ?? 2);

        if ($expertCount <= 0 || $active <= 0) {
            return [];
        }
        $active = min($active, $expertCount);

        $hash = hash('sha256', $this->run->id . ':' . $tokenIndex);
        $picked = [];
        $offset = 0;
        // Step through hash bytes; collect unique expert IDs until we have $active.
        while (count($picked) < $active && $offset < 64) {
            $byte = hexdec(substr($hash, $offset * 2, 2));
            $expert = $byte % $expertCount;
            if (! in_array($expert, $picked, true)) {
                $picked[] = $expert;
            }
            $offset++;
        }
        // Pad deterministically if the hash happened to collide enough times.
        while (count($picked) < $active) {
            $next = (end($picked) + 1) % $expertCount;
            if (! in_array($next, $picked, true)) {
                $picked[] = $next;
            }
        }

        return $picked;
    }

    /**
     * Synthetic top-k probabilities for the selected experts.
     * Sums to 1.0; the first-picked expert gets the most weight,
     * subsequent ones diminish. Pure illustration — we don't have
     * real router logits from any proprietary vendor.
     *
     * @param  list<int>  $experts
     * @return list<float>
     */
    private function scoresFor(array $experts): array
    {
        $n = count($experts);
        if ($n === 0) {
            return [];
        }
        // Decay: 0.5, 0.25, 0.125, ... renormalized.
        $raw = [];
        for ($i = 0; $i < $n; $i++) {
            $raw[] = 1.0 / (2 ** ($i + 1));
        }
        $sum = array_sum($raw);

        return array_map(fn ($v) => round($v / $sum, 4), $raw);
    }
}
