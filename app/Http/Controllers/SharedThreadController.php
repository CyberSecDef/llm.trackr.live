<?php

namespace App\Http\Controllers;

use App\Models\Run;
use App\Models\Thread;
use Inertia\Inertia;
use Inertia\Response;

/**
 * GET /share/{token} — public read-only thread reader (M11 chunk 2).
 *
 * No auth middleware: anonymous viewers + signed-in users both
 * land here. IP rate-limited (60/min) via the `share` RateLimiter.
 * 404 on any invalid token — no info leak about whether a token
 * "used to" exist.
 *
 * Per chunk-2 decision the response shape is sanitized:
 *   - No `user_id` / `model_id` / `api_key_id` on the runs.
 *   - No `system_prompt`, no `default_*` on the thread.
 *   - Owner.store_prompts=false → null `prompt` fields are
 *     replaced with "[prompt redacted by author]" so the reader
 *     understands the gap.
 *
 * Replay per run is supported via SharedReplayController at
 * /share/{token}/runs/{run}/replay — same auth-bypass + same
 * rate-limit budget.
 */
class SharedThreadController extends Controller
{
    public function show(string $token): Response
    {
        $thread = Thread::query()
            ->whereNotNull('share_token')
            ->where('share_token', $token)
            ->with('user:id,store_prompts')
            ->first();

        abort_if($thread === null, 404);

        $ownerStoresPrompts = (bool) $thread->user?->store_prompts;
        $redactedPlaceholder = '[prompt redacted by author]';

        $runs = $thread->runs()
            ->orderBy('sequence_in_thread')
            ->get()
            ->map(fn (Run $run) => [
                'id' => $run->id,
                'sequence_in_thread' => $run->sequence_in_thread,
                'status' => $run->status->value,
                'prompt' => $this->resolvePrompt($run->prompt, $ownerStoresPrompts, $redactedPlaceholder),
                'output_text' => $run->output_text,
                'error_message' => $run->error_message,
                'input_tokens' => $run->input_tokens,
                'output_tokens' => $run->output_tokens,
                'duration_ms' => $run->duration_ms,
                'estimated_cost' => $run->estimated_cost,
                'created_at' => $run->created_at?->toIso8601String(),
                'total_layers' => $run->parameters['model_snapshot']['layers'] ?? null,
                'architecture_type' => $run->parameters['model_snapshot']['architecture_type'] ?? null,
            ]);

        return Inertia::render('Share/Show', [
            'token' => $token,
            'thread' => [
                'id' => $thread->id,
                'title' => $thread->title,
                'tags' => $thread->tags ?? [],
                'last_activity_at' => $thread->last_activity_at?->toIso8601String(),
                'created_at' => $thread->created_at?->toIso8601String(),
            ],
            'runs' => $runs,
            'prompts_redacted' => ! $ownerStoresPrompts,
        ]);
    }

    private function resolvePrompt(?string $stored, bool $ownerStoresPrompts, string $placeholder): ?string
    {
        if ($stored !== null) {
            return $stored;
        }
        if (! $ownerStoresPrompts) {
            return $placeholder;
        }

        return null;
    }
}
