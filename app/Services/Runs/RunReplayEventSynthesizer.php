<?php

namespace App\Services\Runs;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\Llm\LlmTokenChunk;

/**
 * Replays a saved `Run` into the same wire-shape event sequence the
 * live broadcast pipeline emits (M6). The token_log column holds
 * one entry per generated token; this service synthesizes the
 * complementary `LayerAdvanced` + `MoeRouted` events deterministically
 * via the existing `RunEventEmitter` so replay animations are
 * frame-identical to the original live render (SPEC §10.1).
 *
 * Output shape matches `useRunStream`'s `RunEvent[]` exactly:
 *   [{ event: 'run.started', payload: {...} },
 *    { event: 'token.received', payload: {...} },
 *    { event: 'layer.advanced', payload: {...} },
 *    (moe.routed if MoE) ...,
 *    { event: 'run.completed' | 'run.errored', payload: {...} }]
 *
 * Used by `ReplayController::show()` to hand the frontend a static
 * events prop; the Replay page feeds it through the M8 components
 * via `useEventPlayback({ mode: 'replay' })`.
 */
class RunReplayEventSynthesizer
{
    public function __construct(private readonly Run $run) {}

    /**
     * Build the full event array. Order matches live streaming exactly:
     *  1. run.started
     *  2. for each token_log entry: token.received → layer.advanced (→ moe.routed)
     *  3. run.completed OR run.errored
     *
     * @return list<array{event: string, payload: array<string, mixed>}>
     */
    public function build(): array
    {
        $events = [];
        $emitter = new RunEventEmitter($this->run);

        // run.started — synthesize from the run's created_at since
        // we don't persist a separate started_at field.
        $events[] = [
            'event' => 'run.started',
            'payload' => [
                'run_id' => $this->run->id,
                'thread_id' => $this->run->thread_id,
                'model_id' => $this->run->model_id,
                'started_at' => $this->run->created_at?->toIso8601String() ?? '',
            ],
        ];

        // Per-token: token.received + layer.advanced (+ moe.routed for MoE).
        // Reusing RunEventEmitter ensures MoE expert selection follows the
        // same deterministic hash as live streaming.
        $log = $this->run->token_log ?? [];
        foreach ($log as $entry) {
            $tokenIndex = (int) ($entry['index'] ?? 0);
            $tMs = (int) ($entry['t_ms'] ?? 0);
            $chunk = new LlmTokenChunk(
                text: (string) ($entry['token'] ?? ''),
                index: $tokenIndex,
                logprobs: $entry['logprobs'] ?? null,
                isFinal: false,
            );
            foreach ($emitter->eventsForChunk($chunk, $tokenIndex, $tMs) as $event) {
                $events[] = [
                    'event' => $event->broadcastAs(),
                    'payload' => $event->broadcastWith(),
                ];
            }
        }

        // Terminal event: run.completed for clean runs, run.errored for
        // errored ones. Non-terminal runs (still streaming) are blocked
        // by the controller's authz check; we still handle them here
        // for completeness.
        if ($this->run->status === RunStatus::Complete) {
            $completed = $emitter->completedEvent(
                inputTokens: $this->run->input_tokens ?? 0,
                outputTokens: $this->run->output_tokens ?? count($log),
                durationMs: $this->run->duration_ms ?? 0,
                estimatedCost: $this->run->estimated_cost,
            );
            $events[] = [
                'event' => $completed->broadcastAs(),
                'payload' => $completed->broadcastWith(),
            ];
        } elseif ($this->run->status === RunStatus::Error) {
            $errored = $emitter->erroredEvent(
                message: $this->run->error_message ?? 'Unknown error',
                partialOutput: $this->run->output_text,
            );
            $events[] = [
                'event' => $errored->broadcastAs(),
                'payload' => $errored->broadcastWith(),
            ];
        }

        return $events;
    }
}
