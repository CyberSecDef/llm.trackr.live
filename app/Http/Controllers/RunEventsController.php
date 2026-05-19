<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Run;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /runs/{run}/events?since=N — JSON backfill for WebSocket
 * reconnects (M6 chunk 6).
 *
 * Pusher-js auto-reconnects WebSocket connections but does NOT replay
 * messages broadcast during the disconnect window. The frontend hook
 * (useRunStream) tracks the highest token-index it has seen and, on
 * reconnect, calls this endpoint with `since=lastSeen+1` to backfill
 * the gap. The SSE fallback exists for harder failures (chunk 5a/b);
 * this is the lightweight catch-up path for transient blips.
 *
 * The response shape is deliberately small — one HTTP round-trip, no
 * streaming, no FPM-worker hold. For terminal runs it also includes a
 * `completion` or `error` block so the hook can emit the closing
 * event without a second fetch.
 *
 * Owner-only authz; same invariant as the channel auth + the SSE +
 * the debug page.
 */
class RunEventsController extends Controller
{
    public function index(Request $request, Run $run): JsonResponse
    {
        abort_unless($run->user_id === $request->user()->id, 403);

        $since = max(0, (int) $request->query('since', 0));
        $log = $run->token_log ?? [];
        $slice = array_slice($log, $since);

        return response()->json([
            'run_id' => $run->id,
            'status' => $run->status->value,
            'since' => $since,
            'cursor' => count($log),
            'token_log' => array_values($slice),
            'completion' => $run->status === RunStatus::Complete ? [
                'input_tokens' => $run->input_tokens ?? 0,
                'output_tokens' => $run->output_tokens ?? 0,
                'duration_ms' => $run->duration_ms ?? 0,
                'tokens_per_second' => $run->tokens_per_second ?? 0.0,
                'estimated_cost' => $run->estimated_cost,
            ] : null,
            'error' => $run->status === RunStatus::Error ? [
                'message' => $run->error_message ?? '',
                'partial_output' => $run->output_text,
            ] : null,
        ]);
    }
}
