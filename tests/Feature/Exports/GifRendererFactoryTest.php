<?php

use App\Models\Run;
use App\Services\Exports\ChromiumDetector;
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

    it('resolves puppeteer driver to SvgRenderer with PuppeteerFrameRenderer injected (chunk 4)', function () {
        // Chromium available → factory uses the puppeteer path
        // (still returns an SvgRenderer orchestrator, just with the
        // Puppeteer frame renderer inside). Verified via the
        // fallbackEngaged() flag staying false.
        $tmp = tempnam(sys_get_temp_dir(), 'chromium-');
        chmod($tmp, 0755);

        $detector = new ChromiumDetector([$tmp]);
        app()->instance(ChromiumDetector::class, $detector);

        $factory = app(GifRendererFactory::class);
        $renderer = $factory->make('puppeteer');
        expect($renderer)->toBeInstanceOf(SvgRenderer::class);
        expect($factory->fallbackEngaged())->toBeFalse();

        @unlink($tmp);
    });

    it('explicit driver override beats config', function () {
        config()->set('gif_export.renderer', 'svg');
        expect(app(GifRendererFactory::class)->make('null'))->toBeInstanceOf(NullRenderer::class);
    });
});

describe('GifRendererFactory — Chromium-missing fallback (M10 chunk 6)', function () {
    it('falls back to SvgRenderer + sets fallbackEngaged when Chromium is missing', function () {
        $detector = new ChromiumDetector(['/never/exists/chromium']);
        app()->instance(ChromiumDetector::class, $detector);

        $factory = app(GifRendererFactory::class);
        $renderer = $factory->make('puppeteer');
        expect($renderer)->toBeInstanceOf(SvgRenderer::class);
        expect($factory->fallbackEngaged())->toBeTrue();
    });

    it('fallback flag is per-call: a subsequent svg make() clears it', function () {
        $detector = new ChromiumDetector(['/never']);
        app()->instance(ChromiumDetector::class, $detector);

        $factory = app(GifRendererFactory::class);
        $factory->make('puppeteer');
        expect($factory->fallbackEngaged())->toBeTrue();
        $factory->make('svg');
        expect($factory->fallbackEngaged())->toBeFalse();
    });

    it('only the puppeteer arm triggers the fallback (svg + default stay false)', function () {
        $detector = new ChromiumDetector(['/never']);
        app()->instance(ChromiumDetector::class, $detector);

        $factory = app(GifRendererFactory::class);
        $factory->make('svg');
        expect($factory->fallbackEngaged())->toBeFalse();
        $factory->make('null');
        expect($factory->fallbackEngaged())->toBeFalse();
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
