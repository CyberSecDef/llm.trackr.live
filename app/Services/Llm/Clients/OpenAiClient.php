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
 * OpenAI chat-completions client (and base class for the four other
 * OpenAI-compatible vendors landed in chunk 4: xAI, Mistral, Groq,
 * Together). Each of those subclasses overrides `vendor()` and
 * `defaultBaseUrl()`; everything else is shared.
 *
 * Streaming uses Server-Sent Events parsed by SseParser. Logprobs are
 * requested (top-5 alternatives per token) when the model supports
 * them — the visualization's logits panel (SPEC §3.1.5) reads these.
 *
 * API key handling: each call decrypts the key from the supplied
 * ApiKey model on the fly. Keys aren't held in instance state, so
 * the client is safely shared across requests / users.
 */
class OpenAiClient implements LlmClientInterface
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly SseParser $sseParser,
    ) {}

    public function vendor(): string
    {
        return 'openai';
    }

    protected function defaultBaseUrl(): string
    {
        return (string) config('services.openai.base_url', 'https://api.openai.com/v1');
    }

    /**
     * Per-vendor header injection point — Azure / xAI / etc. may want
     * extra headers; the base just sets Bearer auth.
     *
     * @return array<string, string>
     */
    protected function extraHeaders(ApiKey $apiKey): array
    {
        $org = config('services.openai.organization');

        return $org ? ['OpenAI-Organization' => (string) $org] : [];
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
            ->post('/chat/completions', $payload);

        $this->guardResponse($response);

        $body = $response->toPsrResponse()->getBody();
        $index = 0;
        foreach ($this->sseParser->parse($body) as $event) {
            $chunk = $this->eventToChunk($event, $index);
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

        $response = $this->request($apiKey)->post('/chat/completions', $payload);
        $this->guardResponse($response);

        $body = $response->json();
        $choice = $body['choices'][0] ?? [];
        $usage = $body['usage'] ?? [];

        $apiKey->touchUsed();

        return new LlmCompletion(
            text: (string) ($choice['message']['content'] ?? ''),
            usage: new LlmUsage(
                inputTokens: (int) ($usage['prompt_tokens'] ?? 0),
                outputTokens: (int) ($usage['completion_tokens'] ?? 0),
            ),
            logprobs: $choice['logprobs']['content'] ?? null,
            rawResponse: $body,
        );
    }

    /**
     * Build the OpenAI chat-completions request body. Subclasses
     * (xAI / Mistral / Groq / Together) can override to drop or
     * rename params their endpoint doesn't accept.
     *
     * @param  array<string, mixed>  $params
     * @param  list<array{role: string, content: string}>  $history
     * @return array<string, mixed>
     */
    protected function buildPayload(
        string $model,
        string $prompt,
        array $params,
        array $history,
        bool $stream,
    ): array {
        $messages = $history;
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $body = [
            'model' => $model,
            'messages' => $messages,
            'stream' => $stream,
        ];

        if ($stream) {
            // include_usage gives us a final chunk with token totals.
            $body['stream_options'] = ['include_usage' => true];
        }

        foreach (['temperature', 'top_p', 'max_tokens', 'seed'] as $key) {
            if (array_key_exists($key, $params) && $params[$key] !== null) {
                $body[$key] = $params[$key];
            }
        }

        // top_k isn't an OpenAI param; skip it silently.

        if (! empty($params['logprobs'])) {
            $body['logprobs'] = true;
            $body['top_logprobs'] = (int) ($params['top_logprobs'] ?? 5);
        }

        return $body;
    }

    /**
     * Convert one OpenAI SSE event into an LlmTokenChunk, or null if
     * the event has no text content (e.g. the leading "role" delta).
     *
     * @param  array<string, mixed>  $event
     */
    protected function eventToChunk(array $event, int $index): ?LlmTokenChunk
    {
        $choice = $event['choices'][0] ?? null;
        $delta = $choice['delta'] ?? [];
        $text = (string) ($delta['content'] ?? '');
        $finishReason = $choice['finish_reason'] ?? null;
        $usage = $event['usage'] ?? null;

        // Usage-only chunks (the final one when include_usage=true)
        // arrive with empty choices and a populated usage block. We
        // still yield them so the orchestrator can record the totals.
        if ($text === '' && $finishReason === null && $usage === null) {
            return null;
        }

        return new LlmTokenChunk(
            text: $text,
            index: $index,
            logprobs: $choice['logprobs']['content'] ?? null,
            isFinal: $finishReason !== null,
            usage: $usage !== null ? [
                'input_tokens' => (int) ($usage['prompt_tokens'] ?? 0),
                'output_tokens' => (int) ($usage['completion_tokens'] ?? 0),
            ] : null,
        );
    }

    /**
     * Set up the PendingRequest with vendor base URL, auth, and any
     * extra headers. The base URL comes from config — chunk 4's
     * vendor-client subclasses override defaultBaseUrl().
     */
    protected function request(ApiKey $apiKey): PendingRequest
    {
        return $this->http
            ->withToken($apiKey->encrypted_key)
            ->acceptJson()
            ->withHeaders($this->extraHeaders($apiKey))
            ->baseUrl(rtrim($this->defaultBaseUrl(), '/'))
            ->timeout(120);
    }

    /**
     * Convert vendor HTTP error responses to our exception hierarchy.
     */
    protected function guardResponse(Response $response): void
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
