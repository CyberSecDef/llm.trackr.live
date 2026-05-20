<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use App\Services\Runs\RunReplayEventSynthesizer;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * GET /threads/{thread}/runs/{run}/replay (M9 chunk 1).
 *
 * Renders a standalone replay page that reuses every M8 viz component
 * but feeds them a static event stream synthesized from
 * `runs.token_log` instead of the live WebSocket. The synthesized
 * event sequence is bit-identical to what the original run broadcast
 * (SPEC §10.1) — MoE expert routing is a pure function of
 * (run.id, token_index) via the chunk-6 hash-based PRNG.
 *
 * Authz: the thread must belong to the signed-in user AND the run
 * must belong to the thread. Non-terminal runs (`pending`,
 * `streaming`) are rejected with 422 — they don't have a stable
 * token_log to replay, and the user can already watch them live.
 */
class ReplayController extends Controller
{
    public function show(Request $request, Thread $thread, Run $run): Response
    {
        abort_unless($thread->user_id === $request->user()->id, 403);
        // The {run} bound model could be from a different thread; tighten.
        abort_unless($run->thread_id === $thread->id, 404);
        abort_unless(
            in_array($run->status, [RunStatus::Complete, RunStatus::Error], true),
            422,
        );

        $run->load('model');
        $events = (new RunReplayEventSynthesizer($run))->build();
        $model = $run->model;

        return Inertia::render('Runs/Replay', [
            'thread' => [
                'id' => $thread->id,
                'title' => $thread->title,
            ],
            'run' => [
                'id' => $run->id,
                'sequence_in_thread' => $run->sequence_in_thread,
                'status' => $run->status->value,
                'prompt' => $run->prompt,
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
            // Same shape the thread detail page uses for usable_models so
            // the Replay page's pricing/context bar calc can re-use the
            // chunk-4 streamMetrics helper unchanged.
            'model' => $model ? [
                'id' => $model->id,
                'vendor' => $model->vendor,
                'name' => $model->name,
                'display_name' => $model->display_name,
                'architecture_type' => $model->architecture_type?->value,
                'context_length' => $model->context_length,
                'pricing_input_per_million' => $model->pricing_input_per_million,
                'pricing_output_per_million' => $model->pricing_output_per_million,
                'moe_experts' => $model->moe_experts,
                'moe_active_experts' => $model->moe_active_experts,
            ] : null,
        ]);
    }
}
