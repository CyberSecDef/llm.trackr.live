<?php

use App\Services\Exports\ExportStorage;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('local');
    config()->set('gif_export.storage_disk', 'local');
});

describe('ExportStorage paths', function () {
    it('emits exports/{run_id}.gif + .mp4 paths', function () {
        $storage = new ExportStorage;
        expect($storage->gifPath(123))->toBe('exports/123.gif');
        expect($storage->mp4Path(123))->toBe('exports/123.mp4');
    });
});

describe('ExportStorage cache-hit checks', function () {
    it('hasGif / hasMp4 are false when no files exist', function () {
        $storage = new ExportStorage;
        expect($storage->hasGif(1))->toBeFalse();
        expect($storage->hasMp4(1))->toBeFalse();
        expect($storage->bothExist(1))->toBeFalse();
    });

    it('hasGif is true once the file is written', function () {
        Storage::disk('local')->put('exports/42.gif', 'GIF89a...');
        $storage = new ExportStorage;
        expect($storage->hasGif(42))->toBeTrue();
        expect($storage->hasMp4(42))->toBeFalse();
        expect($storage->bothExist(42))->toBeFalse();
    });

    it('bothExist requires both files (partial renders are a cache miss)', function () {
        Storage::disk('local')->put('exports/77.gif', 'GIF89a...');
        $storage = new ExportStorage;
        expect($storage->bothExist(77))->toBeFalse();

        Storage::disk('local')->put('exports/77.mp4', 'binary mp4');
        expect($storage->bothExist(77))->toBeTrue();
    });

    it('uses the configured disk by default', function () {
        Storage::fake('exports-s3');
        Storage::disk('exports-s3')->put('exports/99.gif', 'GIF89a...');
        Storage::disk('exports-s3')->put('exports/99.mp4', 'mp4');
        config()->set('gif_export.storage_disk', 'exports-s3');

        $storage = new ExportStorage;
        expect($storage->bothExist(99))->toBeTrue();
    });

    it('honors an explicit disk name passed to the constructor', function () {
        Storage::fake('custom');
        Storage::disk('custom')->put('exports/55.gif', 'x');
        Storage::disk('custom')->put('exports/55.mp4', 'y');

        $storage = new ExportStorage('custom');
        expect($storage->bothExist(55))->toBeTrue();
        expect((new ExportStorage('local'))->bothExist(55))->toBeFalse();
    });
});
