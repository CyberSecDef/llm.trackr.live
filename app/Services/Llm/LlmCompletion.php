<?php

namespace App\Services\Llm;

/**
 * Result of a non-streaming completion (the alternative to a stream).
 * Used by clients via complete(); the run-submission flow prefers
 * stream() so this is mostly a fallback path for vendors / requests
 * that don't support streaming.
 */
final class LlmCompletion
{
    /**
     * @param  list<array{token: string, logprob: float}>|null  $logprobs  Top-k logprobs when the vendor exposes them.
     * @param  array<string, mixed>  $rawResponse  Vendor-specific raw payload — useful for debug + future-proofing.
     */
    public function __construct(
        public readonly string $text,
        public readonly LlmUsage $usage,
        public readonly ?array $logprobs = null,
        public readonly array $rawResponse = [],
    ) {}
}
