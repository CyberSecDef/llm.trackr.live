<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use App\Services\Runs\RunReplayEventSynthesizer;
use Inertia\Inertia;
use Inertia\Response;

/**
 * GET /share/{token}/runs/{run}/replay (M11 chunk 2).
 *
 * Public read-only replay of a single terminal run from a shared
 * thread. Same auth-bypass + rate-limit as the parent
 * SharedThreadController; same prompt-redaction policy.
 *
 * Resolves in two steps: token → thread, then thread → run. The
 * route-bound `{run}` could be ANY run in the system; we
 * explicitly verify `run.thread_id === thread.id` to refuse
 * cross-thread leakage attempts (someone with a valid share token
 * for thread A trying to reach a run in private thread B).
 *
 * Non-terminal runs are blocked with 422, matching the M9 chunk-1
 * ReplayController policy.
 */
class SharedReplayController extends Controller
{
    public function show(string $token, Run $run): Response
    {
        $thread = Thread::query()
            ->whereNotNull('share_token')
            ->where('share_token', $token)
            ->with('user:id,store_prompts')
            ->first();

        abort_if($thread === null, 404);
        // Cross-thread defense: the route binding accepts any run id;
        // the run must belong to the shared thread.
        abort_unless($run->thread_id === $thread->id, 404);
        abort_unless(
            in_array($run->status, [RunStatus::Complete, RunStatus::Error], true),
            422,
        );

        $ownerStoresPrompts = (bool) $thread->user?->store_prompts;
        $redactedPlaceholder = '[prompt redacted by author]';

        $run->load('model');
        $events = (new RunReplayEventSynthesizer($run))->build();
        $model = $run->model;

        $prompt = $run->prompt;
        if ($prompt === null && ! $ownerStoresPrompts) {
            $prompt = $redactedPlaceholder;
        }

        return Inertia::render('Share/Replay', [
            'token' => $token,
            'thread' => [
                'id' => $thread->id,
                'title' => $thread->title,
            ],
            'run' => [
                'id' => $run->id,
                'sequence_in_thread' => $run->sequence_in_thread,
                'status' => $run->status->value,
                'prompt' => $prompt,
                'output_text' => $run->output_text,
                'error_message' => $run->error_message,
                'input_tokens' => $run->input_tokens,
                'output_tokens' => $run->output_tokens,
                'duration_ms' => $run->duration_ms,
                'estimated_cost' => $run->estimated_cost,
                'created_at' => $run->created_at?->toIso8601String(),
                'total_layers' => $run->parameters['model_snapshot']['layers'] ?? null,
                'architecture_type' => $run->parameters['model_snapshot']['architecture_type'] ?? null,
            ],
            'events' => $events,
            'model' => $model ? [
                'display_name' => $model->display_name,
                'vendor' => $model->vendor,
                'architecture_type' => $model->architecture_type?->value,
                'context_length' => $model->context_length,
                'pricing_input_per_million' => $model->pricing_input_per_million,
                'pricing_output_per_million' => $model->pricing_output_per_million,
                'moe_experts' => $model->moe_experts,
                'moe_active_experts' => $model->moe_active_experts,
            ] : null,
            'prompts_redacted' => ! $ownerStoresPrompts,
        ]);
    }
}
