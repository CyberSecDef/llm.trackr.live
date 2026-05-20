<?php

use App\Services\Exports\NullVideoEncoder;
use App\Services\Exports\RenderConfig;

describe('NullVideoEncoder', function () {
    it('throws RuntimeException with a clear chunk-3-pending message', function () {
        $encoder = new NullVideoEncoder;

        expect(fn () => $encoder->encode(
            ['frame-001.png', 'frame-002.png'],
            'exports/1.gif',
            'exports/1.mp4',
            new RenderConfig,
        ))->toThrow(RuntimeException::class, 'Video encoder not yet implemented');
    });
});
