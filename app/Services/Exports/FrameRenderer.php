<?php

namespace App\Services\Exports;

use App\Models\Run;
use RuntimeException;

/**
 * Contract for renderers that emit a PNG sequence (M10 chunk 2).
 *
 * Splits the GIF/MP4 pipeline into two phases so each phase can be
 * tested + swapped independently:
 *   1. `FrameRenderer` — produces N PNGs from a Run + RenderConfig.
 *      Two implementations: `SvgFrameRenderer` (chunk 2 — PHP + SVG
 *      + ImageMagick `convert` shell-out) and `PuppeteerFrameRenderer`
 *      (chunk 4 — headless Chrome navigating to /runs/{id}/render).
 *   2. `VideoEncoder` — consumes those PNGs and writes the
 *      final `.gif` + `.mp4` artifacts (chunk 3 — ffmpeg).
 *
 * The orchestrator (`SvgRenderer`, `PuppeteerRenderer`) wires both.
 */
interface FrameRenderer
{
    /**
     * Render a sequence of PNG frames for `$run` into `$outputDir`.
     *
     * @param  string  $outputDir  Absolute path. The renderer is
     *                             free to choose filenames; just
     *                             return them in time order.
     * @return list<string> Absolute PNG paths in playback order.
     *                      Empty array is valid (zero-frame run).
     *
     * @throws RuntimeException When the renderer can't run
     *                          (e.g. `convert` missing).
     */
    public function renderFrames(Run $run, RenderConfig $config, string $outputDir): array;
}
