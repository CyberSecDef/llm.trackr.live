<?php

use App\Models\Run;
use App\Services\Exports\GifRendererFactory;
use App\Services\Exports\NullRenderer;
use App\Services\Exports\RenderConfig;
use App\Services\Exports\SvgRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

describe('GifRendererFactory', function () {
    it('resolves the configured driver via the config key', function () {
        config()->set('gif_export.renderer', 'null');
        expect(app(GifRendererFactory::class)->make())->toBeInstanceOf(NullRenderer::class);
    });

    it('returns NullRenderer when driver is unknown', function () {
        expect(app(GifRendererFactory::class)->make('moonbeam'))->toBeInstanceOf(NullRenderer::class);
    });

    it('resolves svg driver to SvgRenderer (chunk 2)', function () {
        expect(app(GifRendererFactory::class)->make('svg'))->toBeInstanceOf(SvgRenderer::class);
    });

    it('falls back to NullRenderer for puppeteer driver (chunk 4 pending)', function () {
        expect(app(GifRendererFactory::class)->make('puppeteer'))->toBeInstanceOf(NullRenderer::class);
    });

    it('explicit driver override beats config', function () {
        config()->set('gif_export.renderer', 'svg');
        expect(app(GifRendererFactory::class)->make('null'))->toBeInstanceOf(NullRenderer::class);
    });
});

describe('NullRenderer', function () {
    it('throws RuntimeException with a clear message', function () {
        $run = Run::factory()->create();
        $renderer = new NullRenderer;

        expect(fn () => $renderer->render($run, new RenderConfig))
            ->toThrow(RuntimeException::class, 'GIF export not yet implemented');
    });
});
