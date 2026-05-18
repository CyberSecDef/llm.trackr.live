<?php

namespace App\Services\Llm;

/**
 * One token (or short text chunk) emitted by a streaming completion.
 *
 * Vendors differ in the granularity they emit at:
 *   - OpenAI yields per-token chunks with optional logprobs.
 *   - Anthropic yields content_block_delta events with text segments.
 *   - Google yields per-message segments.
 *   - HuggingFace TGI yields single-token chunks.
 *
 * The text field is always populated. logprobs, usage, and the final
 * marker are vendor-specific and may be null even on vendors that
 * normally support them (rate-limited responses, etc.).
 */
final class LlmTokenChunk
{
    /**
     * @param  list<array{token: string, logprob: float}>|null  $logprobs  Top-k token logprobs when the vendor exposes them.
     * @param  array{input_tokens?: int, output_tokens?: int}|null  $usage  Cumulative usage if reported in the chunk.
     */
    public function __construct(
        public readonly string $text,
        public readonly ?int $index = null,
        public readonly ?array $logprobs = null,
        public readonly bool $isFinal = false,
        public readonly ?array $usage = null,
    ) {}
}
