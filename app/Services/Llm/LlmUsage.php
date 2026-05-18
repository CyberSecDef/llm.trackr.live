<?php

namespace App\Services\Llm;

/**
 * Token usage + derived cost for a single completion or stream.
 * Vendors that don't return token counts inline get them estimated
 * via the configured TokenCounter for that vendor.
 */
final class LlmUsage
{
    public function __construct(
        public readonly int $inputTokens,
        public readonly int $outputTokens,
        public readonly ?float $estimatedCost = null,
    ) {}

    public function totalTokens(): int
    {
        return $this->inputTokens + $this->outputTokens;
    }
}
