<?php

namespace App\Services\Llm\Contracts;

use App\Models\ApiKey;
use App\Services\Llm\Exceptions\InvalidApiKeyException;
use App\Services\Llm\Exceptions\LlmClientException;
use App\Services\Llm\Exceptions\VendorRateLimitedException;
use App\Services\Llm\LlmCompletion;
use App\Services\Llm\LlmTokenChunk;
use Generator;

/**
 * Unified contract for talking to an LLM vendor.
 *
 * Implementations are typically constructed via LlmClientFactory rather
 * than directly. Each implementation is stateless per call — the API
 * key is passed in per-request so a user's keys aren't held in shared
 * service state.
 *
 * The hand-rolled-vs-SDK choice (parked-decisions.md item 2) was
 * resolved in favor of hand-rolled because SPEC §3.1.5's logits panel
 * needs OpenAI logprobs that the official Laravel AI SDK doesn't
 * expose. Implementations should pass through vendor-specific data
 * (logprobs, raw chunks) rather than canonicalize it away.
 */
interface LlmClientInterface
{
    /**
     * Stream a completion as a sequence of token chunks.
     *
     * @param  ApiKey  $apiKey  Caller's encrypted key for this vendor. Implementations decrypt via the model's cast.
     * @param  string  $model  Vendor-side model name (e.g. "gpt-4o").
     * @param  string  $prompt  The newest user prompt for this turn.
     * @param  array<string, mixed>  $params  temperature, top_p, top_k, max_tokens, seed, etc.
     * @param  list<array{role: string, content: string}>  $history  Prior turns, oldest first.
     * @return Generator<int, LlmTokenChunk>
     *
     * @throws InvalidApiKeyException Vendor rejected auth.
     * @throws VendorRateLimitedException Vendor returned 429.
     * @throws LlmClientException Any other vendor failure.
     */
    public function stream(
        ApiKey $apiKey,
        string $model,
        string $prompt,
        array $params,
        array $history = [],
    ): Generator;

    /**
     * Non-streaming completion. Used when the vendor doesn't support
     * streaming, when streaming isn't needed (cost estimation, batch
     * jobs), or as a fallback if stream() fails mid-call.
     *
     * @param  array<string, mixed>  $params
     * @param  list<array{role: string, content: string}>  $history
     */
    public function complete(
        ApiKey $apiKey,
        string $model,
        string $prompt,
        array $params,
        array $history = [],
    ): LlmCompletion;

    /**
     * Vendor name this client serves (e.g. 'openai', 'anthropic').
     * Used by LlmClientFactory for registration + lookup.
     */
    public function vendor(): string;
}
