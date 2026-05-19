<?php

namespace App\Http\Controllers;

use App\Models\Run;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * GET /runs/{run}/debug (M6 chunk 4b).
 *
 * The "raw events" debug view called out in the SPEC. Renders a JSON
 * stream of every broadcast event the StreamRunJob emits, plus the
 * run's static metadata header. Used to verify the streaming pipeline
 * works end-to-end before M8 builds the real visualization.
 *
 * Authorization: same-user-as-run. Same rule as the channel-auth
 * callback in routes/channels.php — keeps the access pattern
 * consistent between the WebSocket subscription and the HTTP page that
 * subscribes against it.
 */
class DebugRunController extends Controller
{
    public function show(Request $request, Run $run): Response
    {
        abort_unless($run->user_id === $request->user()->id, 403);

        return Inertia::render('Runs/Debug', [
            'run' => [
                'id' => $run->id,
                'thread_id' => $run->thread_id,
                'model_id' => $run->model_id,
                'sequence_in_thread' => $run->sequence_in_thread,
                'status' => $run->status->value,
                'prompt' => $run->prompt,
                'parameters' => $run->parameters,
                'output_text' => $run->output_text,
                'error_message' => $run->error_message,
                'created_at' => $run->created_at?->toIso8601String(),
            ],
            'channel' => "private-runs.{$run->id}",
        ]);
    }
}
