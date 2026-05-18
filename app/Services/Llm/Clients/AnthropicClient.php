<?php

namespace App\Services\Llm\Clients;

use App\Models\ApiKey;
use App\Services\Llm\Contracts\LlmClientInterface;
use App\Services\Llm\Exceptions\InvalidApiKeyException;
use App\Services\Llm\Exceptions\LlmClientException;
use App\Services\Llm\Exceptions\VendorRateLimitedException;
use App\Services\Llm\LlmCompletion;
use App\Services\Llm\LlmTokenChunk;
use App\Services\Llm\LlmUsage;
use App\Services\Llm\Support\SseParser;
use Generator;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;

/**
 * Anthropic Messages API client.
 *
 * Differs from OpenAI in three key ways:
 *   1. Auth header is `x-api-key`, not `Authorization: Bearer`.
 *   2. `system` is a top-level field (not a message with role=system).
 *   3. Streaming uses named events (`message_start`,
 *      `content_block_delta`, `message_delta`, etc.) — different
 *      payload shapes per event type. SseParser still extracts the
 *      JSON; we dispatch on the `type` field.
 *
 * No logprobs support on Anthropic — the logits panel falls back to
 * synthetic data for Claude models per SPEC §3.1.5.
 */
class AnthropicClient implements LlmClientInterface
{
    private const ANTHROPIC_VERSION = '2023-06-01';

    public function __construct(
        private readonly HttpFactory $http,
        private readonly SseParser $sseParser,
    ) {}

    public function vendor(): string
    {
        return 'anthropic';
    }

    private function defaultBaseUrl(): string
    {
        return (string) config('services.anthropic.base_url', 'https://api.anthropic.com/v1');
    }

    public function stream(
        ApiKey $apiKey,
        string $model,
        string $prompt,
        array $params,
        array $history = [],
    ): Generator {
        $payload = $this->buildPayload($model, $prompt, $params, $history, stream: true);

        $response = $this->request($apiKey)
            ->withOptions(['stream' => true])
            ->post('/messages', $payload);

        $this->guardResponse($response);

        $index = 0;
        $cumulativeUsage = ['input_tokens' => 0, 'output_tokens' => 0];

        foreach ($this->sseParser->parse($response->toPsrResponse()->getBody()) as $event) {
            $chunk = $this->eventToChunk($event, $index, $cumulativeUsage);
            if ($chunk !== null) {
                yield $chunk;
                $index++;
            }
        }

        $apiKey->touchUsed();
    }

    public function complete(
        ApiKey $apiKey,
        string $model,
        string $prompt,
        array $params,
        array $history = [],
    ): LlmCompletion {
        $payload = $this->buildPayload($model, $prompt, $params, $history, stream: false);

        $response = $this->request($apiKey)->post('/messages', $payload);
        $this->guardResponse($response);

        $body = $response->json();
        // Anthropic returns content as an array of blocks; concatenate text blocks.
        $text = collect($body['content'] ?? [])
            ->filter(fn ($block) => ($block['type'] ?? null) === 'text')
            ->pluck('text')
            ->implode('');

        $usage = $body['usage'] ?? [];

        $apiKey->touchUsed();

        return new LlmCompletion(
            text: $text,
            usage: new LlmUsage(
                inputTokens: (int) ($usage['input_tokens'] ?? 0),
                outputTokens: (int) ($usage['output_tokens'] ?? 0),
            ),
            rawResponse: $body,
        );
    }

    /**
     * @param  array<string, mixed>  $params
     * @param  list<array{role: string, content: string}>  $history
     * @return array<string, mixed>
     */
    private function buildPayload(
        string $model,
        string $prompt,
        array $params,
        array $history,
        bool $stream,
    ): array {
        // Extract system messages out of history — Anthropic wants
        // them as a top-level `system` field, concatenated if multiple.
        $systemParts = [];
        $messages = [];
        foreach ($history as $turn) {
            if (($turn['role'] ?? null) === 'system') {
                $systemParts[] = $turn['content'] ?? '';

                continue;
            }
            $messages[] = ['role' => $turn['role'], 'content' => $turn['content']];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $body = [
            'model' => $model,
            'messages' => $messages,
            // Anthropic requires max_tokens. Default to a reasonable
            // upper bound if the caller didn't specify.
            'max_tokens' => (int) ($params['max_tokens'] ?? 4096),
            'stream' => $stream,
        ];

        if ($systemParts !== []) {
            $body['system'] = implode("\n\n", $systemParts);
        }

        foreach (['temperature', 'top_p', 'top_k'] as $key) {
            if (array_key_exists($key, $params) && $params[$key] !== null) {
                $body[$key] = $params[$key];
            }
        }

        // Anthropic doesn't support `seed` or `logprobs` (as of 2026-05).

        return $body;
    }

    /**
     * Translate one Anthropic event payload into an LlmTokenChunk
     * (or null if the event is metadata-only — e.g. message_start,
     * content_block_start, message_stop).
     *
     * Tracks cumulative usage across the stream because Anthropic
     * reports input_tokens in message_start and output_tokens in
     * message_delta — different events.
     *
     * @param  array<string, mixed>  $event
     * @param  array<string, int>  $cumulativeUsage
     */
    private function eventToChunk(array $event, int $index, array &$cumulativeUsage): ?LlmTokenChunk
    {
        $type = $event['type'] ?? null;

        return match ($type) {
            'message_start' => $this->onMessageStart($event, $cumulativeUsage),
            'content_block_delta' => $this->onContentBlockDelta($event, $index),
            'message_delta' => $this->onMessageDelta($event, $index, $cumulativeUsage),
            'message_stop' => null, // already covered by message_delta with stop_reason
            default => null, // content_block_start / content_block_stop / ping
        };
    }

    /**
     * @param  array<string, mixed>  $event
     * @param  array<string, int>  $cumulativeUsage
     */
    private function onMessageStart(array $event, array &$cumulativeUsage): ?LlmTokenChunk
    {
        $usage = $event['message']['usage'] ?? null;
        if (is_array($usage)) {
            $cumulativeUsage['input_tokens'] = (int) ($usage['input_tokens'] ?? 0);
            $cumulativeUsage['output_tokens'] = (int) ($usage['output_tokens'] ?? 0);
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function onContentBlockDelta(array $event, int $index): ?LlmTokenChunk
    {
        $delta = $event['delta'] ?? [];
        if (($delta['type'] ?? null) !== 'text_delta') {
            return null;
        }

        return new LlmTokenChunk(
            text: (string) ($delta['text'] ?? ''),
            index: $index,
        );
    }

    /**
     * @param  array<string, mixed>  $event
     * @param  array<string, int>  $cumulativeUsage
     */
    private function onMessageDelta(array $event, int $index, array &$cumulativeUsage): ?LlmTokenChunk
    {
        $usage = $event['usage'] ?? null;
        if (is_array($usage) && isset($usage['output_tokens'])) {
            $cumulativeUsage['output_tokens'] = (int) $usage['output_tokens'];
        }
        $stopReason = $event['delta']['stop_reason'] ?? null;

        // Final chunk: empty text but carries the cumulative usage and
        // signals completion.
        return new LlmTokenChunk(
            text: '',
            index: $index,
            isFinal: $stopReason !== null,
            usage: $cumulativeUsage,
        );
    }

    private function request(ApiKey $apiKey): PendingRequest
    {
        return $this->http
            ->withHeaders([
                'x-api-key' => $apiKey->encrypted_key,
                'anthropic-version' => self::ANTHROPIC_VERSION,
            ])
            ->acceptJson()
            ->baseUrl(rtrim($this->defaultBaseUrl(), '/'))
            ->timeout(120);
    }

    private function guardResponse(Response $response): void
    {
        if ($response->successful()) {
            return;
        }

        $status = $response->status();
        $message = $response->json('error.message') ?? $response->body();

        match (true) {
            $status === 401 || $status === 403 => throw InvalidApiKeyException::forVendor($this->vendor()),
            $status === 429 => throw new VendorRateLimitedException(
                "Vendor {$this->vendor()} returned 429: {$message}",
                retryAfterSeconds: (int) $response->header('retry-after') ?: null,
            ),
            default => throw new LlmClientException(
                "Vendor {$this->vendor()} returned HTTP {$status}: {$message}",
            ),
        };
    }
}
