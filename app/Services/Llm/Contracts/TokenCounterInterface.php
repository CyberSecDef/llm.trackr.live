<?php

namespace App\Services\Llm\Contracts;

interface TokenCounterInterface
{
    /**
     * Count the tokens for a given text under this vendor's tokenizer.
     */
    public function count(string $text): int;

    /**
     * Whether the count is exact (vendor's real tokenizer is used) or
     * an approximation. Surfaced in the UI as a ~ prefix on the count.
     */
    public function isExact(): bool;
}
