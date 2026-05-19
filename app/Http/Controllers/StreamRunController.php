<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Run;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /runs/{run}/stream — Server-Sent Events fallback for clients
 * that can't establish a WebSocket connection (M6 chunk 5a).
 *
 * Architecture rationale: there's no shared memory between the queue
 * worker that runs StreamRunJob and a PHP-FPM worker handling this
 * request, so we can't tail an in-process queue. Instead, StreamRunJob
 * writes token_log incrementally on every chunk (M6 chunk 5a edit),
 * and this controller polls the run row ~150ms and emits the delta
 * since the last cursor as SSE frames. Tail latency: ~150 ms. No
 * message broker required.
 *
 * SSE frame format (per https://html.spec.whatwg.org/#server-sent-events):
 *
 *   event: token.received
 *   data: {"run_id":1,"token":"Hi",...}
 *
 *   event: run.completed
 *   data: {"run_id":1,...}
 *
 * Frame names match the WebSocket `broadcastAs()` strings so the
 * frontend SSE consumer (chunk 5b) can share the same RunEvent type.
 *
 * Connection lifecycle:
 *   1. Same-user check; 403 otherwise.
 *   2. Stream open. If status=pending on first iteration, wait — the
 *      StreamRunJob will flip to streaming shortly. Emit run.started
 *      when that transition is observed.
 *   3. Per poll iteration: refresh row, emit new token_log entries
 *      since cursor, check for status transitions.
 *   4. On terminal status (complete / error), emit the terminal event
 *      then close cleanly.
 *   5. Heartbeat (SSE comment `: ping\n\n`) every ~30 s so proxies
 *      don't time the connection out.
 *   6. Hard cap at MAX_ITERATIONS to defend against a StreamRunJob
 *      that's hung — the loop won't run forever even if the run is
 *      stuck on pending or streaming.
 *
 * PHP-FPM caveat: a long-lived SSE request ties up an FPM worker for
 * the duration. At our concurrency target the math is OK, but the
 * M13 deployment chunk should size pm.max_children with this in mind.
 */
class StreamRunController extends Controller
{
    /** Hard cap on poll iterations so a stuck run can't hang an FPM worker forever. */
    private const MAX_ITERATIONS = 4000; // ~10 min at 150ms

    /** Poll interval in microseconds. */
    private const POLL_INTERVAL_US = 150_000;

    /** Heartbeat every Nth iteration (~30 s at 150ms). */
    private const HEARTBEAT_EVERY = 200;

    public function stream(Request $request, Run $run): StreamedResponse
    {
        abort_unless($run->user_id === $request->user()->id, 403);

        $response = new StreamedResponse(function () use ($run) {
            $this->emitStream($run);
        });

        $response->headers->set('Content-Type', 'text/event-stream');
        $response->headers->set('Cache-Control', 'no-cache, private');
        $response->headers->set('Connection', 'keep-alive');
        // Tell nginx (and any other reverse proxy that honors it) not
        // to buffer this response — without it, events sit in a 4KB
        // buffer instead of streaming.
        $response->headers->set('X-Accel-Buffering', 'no');

        return $response;
    }

    private function emitStream(Run $run): void
    {
        // Note: we deliberately don't poke `ob_*` here. The test
        // harness wraps the callback in an output buffer to capture
        // the response body; calling ob_end_flush() inside that would
        // dump output to stdout and break test assertions. For real
        // production streaming, disable buffering at the web-server
        // level (nginx: X-Accel-Buffering: no header, set above; or
        // fastcgi_buffering off in nginx.conf; Apache: output_buffering
        // = Off in php.ini). `flush()` after each frame is enough.
        @set_time_limit(0);
        ignore_user_abort(false);

        $cursor = 0;
        $lastStatus = null;
        $iteration = 0;

        while ($iteration < self::MAX_ITERATIONS) {
            if (connection_aborted()) {
                return;
            }

            $run->refresh();

            // Status transition events fire once per transition.
            if ($run->status !== $lastStatus) {
                $this->emitStatusTransition($run, $lastStatus, $run->status);
                $lastStatus = $run->status;
            }

            // Drain new token_log entries.
            $log = $run->token_log ?? [];
            $totalLayers = $run->parameters['model_snapshot']['layers'] ?? null;
            while ($cursor < count($log)) {
                $entry = $log[$cursor];
                $this->emit('token.received', [
                    'run_id' => $run->id,
                    'token' => $entry['token'] ?? '',
                    'index' => $entry['index'] ?? $cursor,
                    't_ms' => $entry['t_ms'] ?? 0,
                    'logprobs' => $entry['logprobs'] ?? null,
                    'is_final' => false,
                ]);
                // Mirror the WebSocket path's per-token layer event so
                // a frontend bound only to SSE gets the same cascade
                // signals.
                $this->emit('layer.advanced', [
                    'run_id' => $run->id,
                    'token_index' => $entry['index'] ?? $cursor,
                    'total_layers' => $totalLayers,
                ]);
                $cursor++;
            }

            // Terminal: emit the closing event, then exit.
            if ($run->status === RunStatus::Complete) {
                $this->emit('run.completed', [
                    'run_id' => $run->id,
                    'input_tokens' => $run->input_tokens ?? 0,
                    'output_tokens' => $run->output_tokens ?? 0,
                    'duration_ms' => $run->duration_ms ?? 0,
                    'tokens_per_second' => $run->tokens_per_second ?? 0.0,
                    'estimated_cost' => $run->estimated_cost,
                ]);

                return;
            }
            if ($run->status === RunStatus::Error) {
                $this->emit('run.errored', [
                    'run_id' => $run->id,
                    'message' => $run->error_message ?? '',
                    'partial_output' => $run->output_text,
                ]);

                return;
            }

            // Keepalive: SSE comments don't fire a frontend event but
            // keep proxies (nginx, cloudflare) from closing idle conns.
            if ($iteration > 0 && $iteration % self::HEARTBEAT_EVERY === 0) {
                echo ": ping\n\n";
                flush();
            }

            $iteration++;
            usleep(self::POLL_INTERVAL_US);
        }
    }

    private function emitStatusTransition(Run $run, ?RunStatus $from, RunStatus $to): void
    {
        // Pending → Streaming is the only mid-stream transition that
        // produces a frontend event. Terminal transitions get their
        // own dedicated emit() calls in the main loop body.
        if ($from !== null && $to === RunStatus::Streaming) {
            $this->emit('run.started', [
                'run_id' => $run->id,
                'thread_id' => $run->thread_id,
                'model_id' => $run->model_id,
                'started_at' => $run->updated_at?->toIso8601String(),
            ]);
        }
        // If $from === null we're on the first iteration. If the run
        // is already past pending (e.g. SSE opened mid-stream), emit
        // run.started retroactively so the client has the same shape
        // it would get on the WebSocket path.
        if ($from === null && in_array($to, [RunStatus::Streaming, RunStatus::Complete, RunStatus::Error], true)) {
            $this->emit('run.started', [
                'run_id' => $run->id,
                'thread_id' => $run->thread_id,
                'model_id' => $run->model_id,
                'started_at' => $run->updated_at?->toIso8601String(),
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function emit(string $event, array $payload): void
    {
        echo "event: {$event}\n";
        echo 'data: ' . json_encode($payload) . "\n\n";
        flush();
    }
}
