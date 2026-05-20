<?php

namespace App\Jobs;

use App\Models\Run;
use App\Services\Exports\ExportStorage;
use App\Services\Exports\GifRenderer;
use App\Services\Exports\RenderConfig;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Queued export of a Run's animation as GIF + MP4 (M10 chunk 1).
 *
 * Lifecycle:
 *   1. Caller dispatches with a run ID (no eloquent model — keeps
 *      the queue payload tiny + survives DB refreshes between
 *      dispatch + work).
 *   2. Worker fetches the run, fast-paths when both export files
 *      already exist (per chunk-1 decision: cache, don't re-render
 *      unless a partial render needs cleanup).
 *   3. Otherwise: resolves the configured GifRenderer (chunk 2 SVG,
 *      chunk 4 Puppeteer, or NullRenderer during scaffolding) and
 *      calls `render(Run, RenderConfig)`.
 *
 * `tries` / `timeout`: 1 try, 5-minute wall-clock cap matching the
 * SPEC's per-export timeout. A failed render lands in
 * `failed_jobs` so an operator can inspect the renderer's
 * exception rather than retry-blasting the queue.
 */
class ExportRunGif implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /** @var int Single try; failures land in failed_jobs for inspection. */
    public int $tries = 1;

    /** @var int 5-minute wall-clock cap on the queued job. */
    public int $timeout = 300;

    public function __construct(public readonly int $runId) {}

    public function handle(GifRenderer $renderer, ExportStorage $storage): void
    {
        // Cache short-circuit. The SPEC says cache hits skip the
        // render entirely; chunks 2 + 4 honor this by checking
        // here rather than inside each concrete renderer.
        if ($storage->bothExist($this->runId)) {
            Log::info('ExportRunGif: cache hit, skipping render', [
                'run_id' => $this->runId,
            ]);

            return;
        }

        /** @var Run|null $run */
        $run = Run::query()->find($this->runId);
        if ($run === null) {
            Log::warning('ExportRunGif: run not found, dropping job', [
                'run_id' => $this->runId,
            ]);

            return;
        }

        $config = new RenderConfig(
            frameRate: (int) config('gif_export.frame_rate', 30),
            maxDurationMs: (int) config('gif_export.max_duration_ms', 300_000),
        );

        $renderer->render($run, $config);
    }
}
