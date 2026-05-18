<?php

namespace App\Services\Threads;

/**
 * Result of a context-budget check (ContextBudgetCalculator::check).
 *
 * `fits` is the answer the caller (RunService::submit) actually wants.
 * The other fields exist so we can surface a useful error message to
 * the user — "trimmed thread, you're 1,200 tokens over the 128K window".
 */
final class ContextBudgetResult
{
    public function __construct(
        public readonly bool $fits,
        public readonly int $totalTokens,
        public readonly int $budget,
        public readonly int $overBy,
    ) {}

    public static function ok(int $totalTokens, int $budget): self
    {
        return new self(fits: true, totalTokens: $totalTokens, budget: $budget, overBy: 0);
    }

    public static function over(int $totalTokens, int $budget): self
    {
        return new self(
            fits: false,
            totalTokens: $totalTokens,
            budget: $budget,
            overBy: $totalTokens - $budget,
        );
    }
}
