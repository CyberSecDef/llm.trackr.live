<?php

use App\Models\Run;
use App\Services\Exports\ExportStorage;
use App\Services\Exports\FrameRenderer;
use App\Services\Exports\RenderConfig;
use App\Services\Exports\SvgRenderer;
use App\Services\Exports\VideoEncoder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

/** Test double — emits N stub PNGs at the given output dir. */
class CountingFrameRenderer implements FrameRenderer
{
    public function __construct(public readonly int $frameCount) {}

    public array $calls = [];

    public function renderFrames(Run $run, RenderConfig $config, string $outputDir): array
    {
        $this->calls[] = ['run_id' => $run->id, 'dir' => $outputDir];
        $paths = [];
        for ($i = 0; $i < $this->frameCount; $i++) {
            $path = $outputDir . '/frame-' . $i . '.png';
            file_put_contents($path, 'PNG');
            $paths[] = $path;
        }

        return $paths;
    }
}

/** Test double — records the encode() call without writing files. */
class RecordingVideoEncoder implements VideoEncoder
{
    public array $calls = [];

    public function encode(array $framePaths, string $gifPath, string $mp4Path, RenderConfig $config): void
    {
        $this->calls[] = [
            'frames' => $framePaths,
            'gif_path' => $gifPath,
            'mp4_path' => $mp4Path,
            'frame_rate' => $config->frameRate,
        ];
    }
}

/** Test double — throws to verify error propagation + cleanup. */
class ThrowingVideoEncoder implements VideoEncoder
{
    public function encode(array $framePaths, string $gifPath, string $mp4Path, RenderConfig $config): void
    {
        throw new RuntimeException('encoder boom');
    }
}

beforeEach(function () {
    Storage::fake('local');
    config()->set('gif_export.storage_disk', 'local');
});

describe('SvgRenderer', function () {
    it('orchestrates frames → encoder and returns a RenderResult', function () {
        $run = Run::factory()->create();
        $frameRenderer = new CountingFrameRenderer(frameCount: 30);
        $encoder = new RecordingVideoEncoder;
        $storage = new ExportStorage;

        $result = (new SvgRenderer($frameRenderer, $encoder, $storage))
            ->render($run, new RenderConfig(frameRate: 30));

        expect($result->framesCount)->toBe(30);
        // 30 frames @ 30 FPS = 1000ms.
        expect($result->durationMs)->toBe(1_000);
        expect($result->gifPath)->toBe("exports/{$run->id}.gif");
        expect($result->mp4Path)->toBe("exports/{$run->id}.mp4");
    });

    it('passes the storage-relative paths to the encoder', function () {
        $run = Run::factory()->create();
        $frameRenderer = new CountingFrameRenderer(frameCount: 5);
        $encoder = new RecordingVideoEncoder;
        $storage = new ExportStorage;

        (new SvgRenderer($frameRenderer, $encoder, $storage))
            ->render($run, new RenderConfig);

        expect($encoder->calls)->toHaveCount(1);
        expect($encoder->calls[0]['gif_path'])->toBe("exports/{$run->id}.gif");
        expect($encoder->calls[0]['mp4_path'])->toBe("exports/{$run->id}.mp4");
        expect($encoder->calls[0]['frames'])->toHaveCount(5);
    });

    it('passes the render config frame_rate to the encoder', function () {
        $run = Run::factory()->create();
        $frameRenderer = new CountingFrameRenderer(frameCount: 12);
        $encoder = new RecordingVideoEncoder;
        $storage = new ExportStorage;

        (new SvgRenderer($frameRenderer, $encoder, $storage))
            ->render($run, new RenderConfig(frameRate: 24));

        expect($encoder->calls[0]['frame_rate'])->toBe(24);
    });

    it('cleans up the tmp dir on success', function () {
        $run = Run::factory()->create();
        $frameRenderer = new CountingFrameRenderer(frameCount: 3);
        $encoder = new RecordingVideoEncoder;
        $storage = new ExportStorage;

        (new SvgRenderer($frameRenderer, $encoder, $storage))
            ->render($run, new RenderConfig);

        // The tmp dir lived under sys_get_temp_dir() and was named with
        // a `llm-trackr-export-{runId}-` prefix. Both the dir and its
        // children should be gone.
        $remnants = glob(sys_get_temp_dir() . "/llm-trackr-export-{$run->id}-*");
        expect($remnants)->toBeEmpty();
    });

    it('cleans up the tmp dir even when the encoder throws', function () {
        $run = Run::factory()->create();
        $frameRenderer = new CountingFrameRenderer(frameCount: 3);
        $encoder = new ThrowingVideoEncoder;
        $storage = new ExportStorage;

        try {
            (new SvgRenderer($frameRenderer, $encoder, $storage))
                ->render($run, new RenderConfig);
            expect()->fail('expected encoder to throw');
        } catch (RuntimeException $e) {
            expect($e->getMessage())->toBe('encoder boom');
        }

        $remnants = glob(sys_get_temp_dir() . "/llm-trackr-export-{$run->id}-*");
        expect($remnants)->toBeEmpty();
    });

    it('throws when the frame renderer produces no frames', function () {
        $run = Run::factory()->create();
        $frameRenderer = new CountingFrameRenderer(frameCount: 0);
        $encoder = new RecordingVideoEncoder;
        $storage = new ExportStorage;

        $renderer = new SvgRenderer($frameRenderer, $encoder, $storage);
        expect(fn () => $renderer->render($run, new RenderConfig))
            ->toThrow(RuntimeException::class, 'no frames');

        // Encoder must not have been called.
        expect($encoder->calls)->toBeEmpty();
    });
});
