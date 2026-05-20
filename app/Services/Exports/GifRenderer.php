<?php

namespace App\Services\Exports;

use App\Models\Run;
use RuntimeException;

/**
 * Contract for GIF/MP4 renderers (M10 chunk 1).
 *
 * Two concrete implementations land in later chunks:
 *   - `SvgRenderer` (chunk 2) — default. PHP iterates token_log,
 *     emits an SVG per frame, Imagick rasterizes, ffmpeg encodes.
 *     Produces a 2D summary view; no Chromium dependency.
 *   - `PuppeteerRenderer` (chunk 4) — opt-in. Spawns a headless
 *     Chrome that navigates to /runs/{id}/render and captures
 *     canvas frames. Produces the full 3D viz; opt-in because of
 *     the Chromium dependency.
 *
 * Selection is wired by `GifRendererFactory` from the
 * `gif_export.renderer` config. The job depends on the interface
 * via DI so swapping is a one-line container binding (used in
 * tests + the chunk-6 fallback path).
 */
interface GifRenderer
{
    /**
     * Render a run to GIF + MP4. Must produce both files at the
     * paths reported in the returned `RenderResult`.
     *
     * @throws RuntimeException When the renderer can't run
     *                          (e.g. ffmpeg missing).
     */
    public function render(Run $run, RenderConfig $config): RenderResult;
}
