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
use Illuminate\Http\Client\Response;

/**
 * Google Gemini client (streamGenerateContent + generateContent).
 *
 * Differences from OpenAI:
 *   1. Auth is an API key in the URL query string, not a header.
 *   2. The model name is in the URL path, not the body.
 *   3. Body uses `contents` with `parts[]` arrays instead of `messages`.
 *   4. Role 'assistant' becomes 'model'.
 *   5. System messages become a `systemInstruction` top-level field.
 *   6. Generation params live under `generationConfig`.
 *
 * Uses the `?alt=sse` variant of streamGenerateContent so we get the
 * standard SSE format that SseParser handles. No logprobs exposed.
 */
class GoogleGeminiClient implements LlmClientInterface
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly SseParser $sseParser,
    ) {}

    public function vendor(): string
    {
        return 'google';
    }

    private function defaultBaseUrl(): string
    {
        return (string) config('services.google_gemini.base_url', 'https://generativelanguage.googleapis.com/v1beta');
    }

    public function stream(
        ApiKey $apiKey,
        string $model,
        string $prompt,
        array $params,
        array $history = [],
    ): Generator {
        $payload = $this->buildPayload($prompt, $params, $history);
        $url = $this->endpointUrl($model, 'streamGenerateContent', $apiKey);

        $response = $this->http
            ->acceptJson()
            ->timeout(120)
            ->withOptions(['stream' => true])
            ->post($url . '&alt=sse', $payload);

        $this->guardResponse($response);

        $index = 0;
        $usage = null;

        foreach ($this->sseParser->parse($response->toPsrResponse()->getBody()) as $event) {
            $candidate = $event['candidates'][0] ?? null;
            $text = $this->extractText($candidate);
            $finishReason = $candidate['finishReason'] ?? null;
            $usageMeta = $event['usageMetadata'] ?? null;
            if ($usageMeta !== null) {
                $usage = [
                    'input_tokens' => (int) ($usageMeta['promptTokenCount'] ?? 0),
                    'output_tokens' => (int) ($usageMeta['candidatesTokenCount'] ?? 0),
                ];
            }

            if ($text === '' && $finishReason === null && $usage === null) {
                continue;
            }

            yield new LlmTokenChunk(
                text: $text,
                index: $index,
                isFinal: $finishReason !== null,
                usage: $usage,
            );
            $index++;
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
        $payload = $this->buildPayload($prompt, $params, $history);
        $url = $this->endpointUrl($model, 'generateContent', $apiKey);

        $response = $this->http
            ->acceptJson()
            ->timeout(120)
            ->post($url, $payload);

        $this->guardResponse($response);

        $body = $response->json();
        $candidate = $body['candidates'][0] ?? null;
        $text = $this->extractText($candidate);
        $usage = $body['usageMetadata'] ?? [];

        $apiKey->touchUsed();

        return new LlmCompletion(
            text: $text,
            usage: new LlmUsage(
                inputTokens: (int) ($usage['promptTokenCount'] ?? 0),
                outputTokens: (int) ($usage['candidatesTokenCount'] ?? 0),
            ),
            rawResponse: $body,
        );
    }

    /**
     * @param  array<string, mixed>  $params
     * @param  list<array{role: string, content: string}>  $history
     * @return array<string, mixed>
     */
    private function buildPayload(string $prompt, array $params, array $history): array
    {
        $systemParts = [];
        $contents = [];
        foreach ($history as $turn) {
            $role = $turn['role'] ?? 'user';
            if ($role === 'system') {
                $systemParts[] = $turn['content'] ?? '';

                continue;
            }
            $contents[] = [
                // Gemini uses 'model' instead of 'assistant'.
                'role' => $role === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => (string) ($turn['content'] ?? '')]],
            ];
        }
        $contents[] = [
            'role' => 'user',
            'parts' => [['text' => $prompt]],
        ];

        $body = ['contents' => $contents];

        if ($systemParts !== []) {
            $body['systemInstruction'] = [
                'parts' => [['text' => implode("\n\n", $systemParts)]],
            ];
        }

        $generationConfig = [];
        if (isset($params['temperature'])) {
            $generationConfig['temperature'] = $params['temperature'];
        }
        if (isset($params['top_p'])) {
            $generationConfig['topP'] = $params['top_p'];
        }
        if (isset($params['top_k'])) {
            $generationConfig['topK'] = $params['top_k'];
        }
        if (isset($params['max_tokens'])) {
            $generationConfig['maxOutputTokens'] = $params['max_tokens'];
        }
        if (isset($params['seed'])) {
            // Gemini's docs call this seed; tested working at v1beta.
            $generationConfig['seed'] = $params['seed'];
        }

        if ($generationConfig !== []) {
            $body['generationConfig'] = $generationConfig;
        }

        return $body;
    }

    /**
     * @param  array<string, mixed>|null  $candidate
     */
    private function extractText(?array $candidate): string
    {
        if ($candidate === null) {
            return '';
        }

        return collect($candidate['content']['parts'] ?? [])
            ->pluck('text')
            ->filter(fn ($t) => is_string($t))
            ->implode('');
    }

    private function endpointUrl(string $model, string $action, ApiKey $apiKey): string
    {
        $base = rtrim($this->defaultBaseUrl(), '/');

        return "{$base}/models/{$model}:{$action}?key=" . urlencode($apiKey->encrypted_key);
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
