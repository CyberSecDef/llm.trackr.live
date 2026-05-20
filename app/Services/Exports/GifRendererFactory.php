<?php

namespace App\Services\Exports;

use Illuminate\Contracts\Container\Container;

/**
 * Picks the active renderer per the `gif_export.renderer` config.
 *
 * Selection table:
 *   'svg'        → SvgRenderer (chunk 2 — currently falls back to
 *                  NullRenderer; not implemented yet).
 *   'puppeteer'  → PuppeteerRenderer (chunk 4 — same fallback).
 *   anything else → NullRenderer.
 *
 * The factory itself is bound in `AppServiceProvider` as the
 * concrete resolver for the `GifRenderer` interface — that way
 * the `ExportRunGif` job and any other consumer can ask for the
 * interface and get the right implementation per config + env.
 *
 * Tests swap with `app()->instance(GifRenderer::class, $fake)`
 * which bypasses the factory entirely — see chunk 6's fallback
 * path test for the pattern.
 */
class GifRendererFactory
{
    public function __construct(private readonly Container $container) {}

    public function make(?string $driver = null): GifRenderer
    {
        $driver ??= (string) config('gif_export.renderer', 'null');

        return match ($driver) {
            // M10 chunk 2: 'svg' resolves to SvgRenderer. Its
            // FrameRenderer + VideoEncoder are resolved from the
            // container so chunk 3 can swap NullVideoEncoder for
            // FfmpegEncoder with a single binding change.
            'svg' => $this->container->make(SvgRenderer::class),

            // M10 chunk 4 skeleton: reuse the SvgRenderer orchestrator
            // (the chunk-2 design point — encoder + storage are
            // renderer-agnostic) but inject a PuppeteerFrameRenderer
            // built from the configured node script path. The
            // PuppeteerFrameRenderer raises ChromiumUnavailableException
            // when Chromium is missing — chunk 6's fallback will catch
            // this and re-dispatch with the SVG renderer.
            'puppeteer' => new SvgRenderer(
                frameRenderer: new PuppeteerFrameRenderer(
                    $this->container->make(ChromiumDetector::class),
                    (string) config(
                        'gif_export.node_script_path',
                        base_path('node-scripts/puppeteer-export.cjs'),
                    ),
                ),
                encoder: $this->container->make(VideoEncoder::class),
                storage: $this->container->make(ExportStorage::class),
            ),
            default => new NullRenderer,
        };
    }
}
