<?php

namespace App\Services\Exports;

use Illuminate\Contracts\Container\Container;
use Illuminate\Support\Facades\Log;

/**
 * Picks the active renderer per the `gif_export.renderer` config.
 *
 * Selection table:
 *   'svg'        → SvgRenderer.
 *   'puppeteer'  → SvgRenderer orchestrator with PuppeteerFrameRenderer.
 *                  CHUNK 6 FALLBACK: if Chromium isn't installed when
 *                  the factory resolves, logs a one-time warning AND
 *                  silently returns the SVG-bound renderer instead.
 *                  Callers can inspect `fallbackEngaged()` to learn
 *                  that the requested renderer was swapped out.
 *   anything else → NullRenderer.
 *
 * The factory is bound in `AppServiceProvider` as the concrete
 * resolver for the `GifRenderer` interface — that way the
 * `ExportRunGif` job and any other consumer can ask for the
 * interface and get the right implementation per config + env.
 *
 * Tests swap with `app()->instance(GifRenderer::class, $fake)`
 * which bypasses the factory entirely.
 */
class GifRendererFactory
{
    /**
     * Whether the most recent `make()` call swapped the configured
     * renderer for a fallback. Cleared at the start of every
     * `make()` so each resolution is independently inspectable.
     */
    private bool $fallbackEngaged = false;

    /** Per-process latch so the warning log fires once, not per-export. */
    private bool $fallbackWarningLogged = false;

    public function __construct(private readonly Container $container) {}

    public function make(?string $driver = null): GifRenderer
    {
        $driver ??= (string) config('gif_export.renderer', 'null');
        $this->fallbackEngaged = false;

        return match ($driver) {
            // M10 chunk 2: 'svg' resolves to SvgRenderer. Its
            // FrameRenderer + VideoEncoder are resolved from the
            // container so chunk 3 can swap NullVideoEncoder for
            // FfmpegEncoder with a single binding change.
            'svg' => $this->container->make(SvgRenderer::class),

            // M10 chunk 4 + chunk 6 fallback: 'puppeteer' resolves
            // to an SvgRenderer orchestrator with PuppeteerFrameRenderer
            // injected — UNLESS Chromium is unavailable, in which case
            // we log once + silently return the SVG-bound renderer so
            // the export still produces a useful artifact.
            'puppeteer' => $this->makePuppeteerOrFallback(),

            default => new NullRenderer,
        };
    }

    /**
     * Returns true when the last `make()` call swapped the requested
     * renderer for a fallback. Callers (the `ExportRunGif` job, the
     * trigger controller) include this in the broadcast payload + the
     * trigger response so the frontend chooser menu can show a
     * "(2D fallback)" badge.
     */
    public function fallbackEngaged(): bool
    {
        return $this->fallbackEngaged;
    }

    private function makePuppeteerOrFallback(): GifRenderer
    {
        $detector = $this->container->make(ChromiumDetector::class);

        if (! $detector->isAvailable()) {
            $this->fallbackEngaged = true;
            if (! $this->fallbackWarningLogged) {
                Log::warning(
                    'GIF_RENDERER=puppeteer configured but no Chromium binary found. '
                    . 'Falling back to the SVG renderer for this process. Install '
                    . 'Chromium (apt install chromium-browser) or set CHROMIUM_PATH.',
                );
                $this->fallbackWarningLogged = true;
            }

            return $this->container->make(SvgRenderer::class);
        }

        return new SvgRenderer(
            frameRenderer: new PuppeteerFrameRenderer(
                $detector,
                (string) config(
                    'gif_export.node_script_path',
                    base_path('node-scripts/puppeteer-export.cjs'),
                ),
            ),
            encoder: $this->container->make(VideoEncoder::class),
            storage: $this->container->make(ExportStorage::class),
        );
    }
}
