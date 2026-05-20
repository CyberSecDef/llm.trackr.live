<?php

use App\Services\Exports\RenderConfig;
use App\Services\Exports\RenderResult;

describe('RenderConfig', function () {
    it('defaults to 30 FPS + 5-minute timeout', function () {
        $config = new RenderConfig;
        expect($config->frameRate)->toBe(30);
        expect($config->maxDurationMs)->toBe(300_000);
    });

    it('exposes a max-frames helper (frameRate × seconds)', function () {
        $config = new RenderConfig(frameRate: 30, maxDurationMs: 300_000);
        expect($config->maxFrames())->toBe(9_000);
    });

    it('withFrameRate returns a new immutable instance', function () {
        $original = new RenderConfig;
        $next = $original->withFrameRate(24);

        expect($next->frameRate)->toBe(24);
        expect($next->maxDurationMs)->toBe($original->maxDurationMs);
        // Original untouched.
        expect($original->frameRate)->toBe(30);
        expect($next)->not->toBe($original);
    });

    it('withMaxDurationMs returns a new immutable instance', function () {
        $original = new RenderConfig;
        $next = $original->withMaxDurationMs(60_000);

        expect($next->maxDurationMs)->toBe(60_000);
        expect($next->frameRate)->toBe($original->frameRate);
        expect($original->maxDurationMs)->toBe(300_000);
    });
});

describe('RenderResult', function () {
    it('captures all four fields', function () {
        $result = new RenderResult(
            gifPath: 'exports/123.gif',
            mp4Path: 'exports/123.mp4',
            framesCount: 90,
            durationMs: 3_000,
        );

        expect($result->gifPath)->toBe('exports/123.gif');
        expect($result->mp4Path)->toBe('exports/123.mp4');
        expect($result->framesCount)->toBe(90);
        expect($result->durationMs)->toBe(3_000);
    });
});
