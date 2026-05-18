<?php

namespace App\Services\Threads;

use App\Enums\RunStatus;
use App\Models\Thread;

/**
 * Build the `[{role, content}, ...]` history array sent to the vendor
 * for a new run within a thread.
 *
 * Shape (vendor-agnostic — each LlmClient routes role=system to the
 * right place for its protocol):
 *   [
 *     {role: 'system',    content: thread.system_prompt}      // if set
 *     {role: 'user',      content: prior_run_1.prompt}
 *     {role: 'assistant', content: prior_run_1.output_text}
 *     {role: 'user',      content: prior_run_2.prompt}
 *     {role: 'assistant', content: prior_run_2.output_text}
 *     // ... ordered by sequence_in_thread
 *   ]
 *
 * Inclusion rules:
 *   - Only runs with status=Complete contribute. Pending/streaming/
 *     errored runs aren't part of the canonical conversation.
 *   - Privacy-redacted prior runs (prompt OR output_text is null)
 *     are SKIPPED entirely. Documented as a known limitation: users
 *     wanting context continuity keep store_prompts=true.
 *   - The CALLER's new prompt is NOT appended here — that's the
 *     vendor client's job (each protocol formats the current turn
 *     differently).
 */
class ConversationHistoryBuilder
{
    /**
     * @return list<array{role: string, content: string}>
     */
    public function build(Thread $thread): array
    {
        $history = [];

        if (! empty(trim((string) $thread->system_prompt))) {
            $history[] = [
                'role' => 'system',
                'content' => $thread->system_prompt,
            ];
        }

        // runs() relation is already ordered by sequence_in_thread.
        $priorRuns = $thread->runs()
            ->where('status', RunStatus::Complete->value)
            ->get();

        foreach ($priorRuns as $run) {
            // Skip privacy-redacted runs — we can't reconstruct what
            // the user said. Including just the assistant half would
            // give the model nonsensical context.
            if ($run->prompt === null || $run->output_text === null) {
                continue;
            }

            $history[] = ['role' => 'user', 'content' => $run->prompt];
            $history[] = ['role' => 'assistant', 'content' => $run->output_text];
        }

        return $history;
    }
}
