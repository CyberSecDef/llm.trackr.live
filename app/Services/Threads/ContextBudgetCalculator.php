<?php

namespace App\Services\Threads;

use App\Models\LlmModel;
use App\Services\Llm\TokenCounter\TokenCounterFactory;

/**
 * Server-side context-budget check before run submission.
 *
 * The frontend does a precise client-side check too (SPEC §3.5 — using
 * tiktoken-js for OpenAI / approximate for others). This is the
 * defense-in-depth check: we can't trust the client, and a malicious
 * caller bypassing the JS would otherwise drive the vendor to a
 * "context_length_exceeded" error that bills the user for nothing.
 *
 * Sums: system prompt + all prior history turns + new prompt + the
 * requested `max_tokens` for the response. The max_tokens reserve
 * ensures we don't fit the input only to have the response overflow.
 *
 * Token counting uses the vendor's TokenCounter via the factory —
 * exact for OpenAI (tiktoken), approximate for everyone else. The
 * approximation is conservative-ish (±20% in English prose) but the
 * client-side check is authoritative for tight-budget submissions.
 */
class ContextBudgetCalculator
{
    public function __construct(
        private readonly TokenCounterFactory $counters,
    ) {}

    /**
     * @param  list<array{role: string, content: string}>  $history
     */
    public function check(
        LlmModel $model,
        array $history,
        string $newPrompt,
        int $reservedForResponse = 0,
    ): ContextBudgetResult {
        $budget = (int) ($model->context_length ?? 0);
        if ($budget <= 0) {
            // Model has no recorded context_length; we can't enforce a
            // budget. Treat as unlimited so submission proceeds — the
            // vendor will reject if it's actually over.
            return ContextBudgetResult::ok(totalTokens: 0, budget: 0);
        }

        $counter = $this->counters->counterFor($model->vendor, $model->name);

        $total = 0;
        foreach ($history as $turn) {
            $total += $counter->count((string) ($turn['content'] ?? ''));
        }
        $total += $counter->count($newPrompt);
        $total += max(0, $reservedForResponse);

        return $total <= $budget
            ? ContextBudgetResult::ok(totalTokens: $total, budget: $budget)
            : ContextBudgetResult::over(totalTokens: $total, budget: $budget);
    }
}
