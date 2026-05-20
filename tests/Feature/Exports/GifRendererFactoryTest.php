<?php

use App\Models\Run;
use App\Services\Exports\GifRendererFactory;
use App\Services\Exports\NullRenderer;
use App\Services\Exports\RenderConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

describe('GifRendererFactory', function () {
    it('resolves the configured driver via the config key', function () {
        config()->set('gif_export.renderer', 'null');
        $factory = new GifRendererFactory;
        expect($factory->make())->toBeInstanceOf(NullRenderer::class);
    });

    it('returns NullRenderer when driver is unknown', function () {
        $factory = new GifRendererFactory;
        expect($factory->make('moonbeam'))->toBeInstanceOf(NullRenderer::class);
    });

    it('falls back to NullRenderer for svg + puppeteer drivers (chunks 2/4 pending)', function () {
        $factory = new GifRendererFactory;
        expect($factory->make('svg'))->toBeInstanceOf(NullRenderer::class);
        expect($factory->make('puppeteer'))->toBeInstanceOf(NullRenderer::class);
    });

    it('explicit driver override beats config', function () {
        config()->set('gif_export.renderer', 'svg');
        $factory = new GifRendererFactory;
        expect($factory->make('null'))->toBeInstanceOf(NullRenderer::class);
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
