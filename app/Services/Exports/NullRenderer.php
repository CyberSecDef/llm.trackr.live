<?php

namespace App\Services\Exports;

use App\Models\Run;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Scaffolding renderer for M10 chunk 1.
 *
 * Real renderers land in chunks 2 (SVG) and 4 (Puppeteer). This
 * placeholder lets the job + factory + storage pipeline exist
 * + be unit-tested before any pixel actually gets pushed.
 *
 * Behavior: logs a warning at render() so the operator sees the
 * scaffolding is wired, then throws so the queued job ends up in
 * the `failed_jobs` table — exactly where you want it during
 * development.
 */
final class NullRenderer implements GifRenderer
{
    public function render(Run $run, RenderConfig $config): RenderResult
    {
        Log::warning('NullRenderer invoked — no real renderer configured', [
            'run_id' => $run->id,
            'frame_rate' => $config->frameRate,
            'max_duration_ms' => $config->maxDurationMs,
        ]);

        throw new RuntimeException(
            'GIF export not yet implemented. Configure GIF_RENDERER=svg or =puppeteer once chunk 2/4 lands.',
        );
    }
}
