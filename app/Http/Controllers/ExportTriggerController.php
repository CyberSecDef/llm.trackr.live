<?php

namespace App\Http\Controllers;

use App\Events\Runs\ExportCompleted;
use App\Jobs\ExportRunGif;
use App\Models\Run;
use App\Services\Exports\ExportStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /runs/{run}/export (M10 chunk 5).
 *
 * Owner-only endpoint that drives the GIF/MP4 chooser flow:
 *
 *   - Cache hit (both .gif + .mp4 already on disk): broadcasts an
 *     immediate `ExportCompleted` AND returns 200 with the URLs in
 *     the response body. The frontend goes straight to the chooser
 *     state — no "Rendering..." flicker. Per chunk-5 decision: no
 *     re-render on click when artifacts exist.
 *
 *   - Cache miss: dispatches `ExportRunGif` (which fires
 *     `ExportCompleted` / `ExportFailed` from the worker side) and
 *     returns 202 with `{ ready: false, status: 'queued' }`. The
 *     frontend then waits for the broadcast.
 */
class ExportTriggerController extends Controller
{
    public function __construct(private readonly ExportStorage $storage) {}

    public function store(Request $request, Run $run): JsonResponse
    {
        abort_unless($run->user_id === $request->user()->id, 403);

        if ($this->storage->bothExist($run->id)) {
            $gifUrl = $this->fileUrl($run, 'gif');
            $mp4Url = $this->fileUrl($run, 'mp4');

            // Re-broadcast so any other open page subscribed to this
            // run's channel flips its chooser state too.
            event(new ExportCompleted(
                run: $run,
                gifUrl: $gifUrl,
                mp4Url: $mp4Url,
                framesCount: 0,
                durationMs: 0,
            ));

            return response()->json([
                'ready' => true,
                'gif_url' => $gifUrl,
                'mp4_url' => $mp4Url,
            ], 200);
        }

        ExportRunGif::dispatch($run->id);

        return response()->json([
            'ready' => false,
            'status' => 'queued',
        ], 202);
    }

    private function fileUrl(Run $run, string $format): string
    {
        return route('runs.exports.show', ['run' => $run->id, 'format' => $format]);
    }
}
