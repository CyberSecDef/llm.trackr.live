<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\Exports\RenderConfig;
use App\Services\Exports\SvgFrameRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;

uses(RefreshDatabase::class);

function makeRenderableRun(array $tokenLog, array $modelSnap = []): Run
{
    return Run::factory()->create([
        'status' => RunStatus::Complete,
        'parameters' => [
            'model_snapshot' => array_merge([
                'architecture_type' => 'dense',
                'layers' => 12,
                'name' => 'gpt-4o',
                'vendor' => 'openai',
            ], $modelSnap),
        ],
        'token_log' => $tokenLog,
    ]);
}

function tokenLogEntry(string $token, int $tMs, int $index = 0, ?array $logprobs = null): array
{
    return [
        'token' => $token,
        'index' => $index,
        't_ms' => $tMs,
        'logprobs' => $logprobs,
    ];
}

beforeEach(function () {
    // Fake `convert` so tests pass without ImageMagick on the
    // runner. The closure receives an Illuminate\Process\PendingProcess;
    // we pull the command string from its `command` property and
    // write a stub PNG so file-existence assertions pass.
    Process::fake([
        'convert*' => function (PendingProcess $process) {
            $cmd = is_array($process->command)
                ? implode(' ', $process->command)
                : (string) $process->command;
            // Last shell-arg is the output PNG path (single-quoted by
            // escapeshellarg).
            if (preg_match("/'([^']+\\.png)'\\s*$/", $cmd, $m)) {
                @file_put_contents($m[1], 'PNG-stub');
            }

            return Process::result(output: '', errorOutput: '', exitCode: 0);
        },
    ]);
});

describe('SvgFrameRenderer::renderFrames', function () {
    it('creates the output directory if it does not exist', function () {
        $run = makeRenderableRun([tokenLogEntry('a', 100)]);
        $dir = sys_get_temp_dir() . '/svg-test-' . uniqid();
        expect(is_dir($dir))->toBeFalse();

        (new SvgFrameRenderer)->renderFrames($run, new RenderConfig, $dir);

        expect(is_dir($dir))->toBeTrue();
        // Cleanup.
        array_map('unlink', glob($dir . '/*') ?: []);
        @rmdir($dir);
    });

    it('emits frame_rate × seconds frames for a non-trivial run', function () {
        // 30 FPS × 1000ms = 30 frames; lastTms 1000 → ceil(1) × 30 = 30 frames.
        $log = [];
        for ($i = 0; $i < 10; $i++) {
            $log[] = tokenLogEntry("t{$i}", ($i + 1) * 100, $i);
        }
        $run = makeRenderableRun($log);
        $dir = sys_get_temp_dir() . '/svg-test-' . uniqid();

        $paths = (new SvgFrameRenderer)->renderFrames($run, new RenderConfig(frameRate: 30), $dir);

        expect($paths)->toHaveCount(30);
        foreach ($paths as $p) {
            expect(file_exists($p))->toBeTrue();
            expect(str_ends_with($p, '.png'))->toBeTrue();
        }

        // Cleanup.
        array_map('unlink', $paths);
        @rmdir($dir);
    });

    it('returns a single static frame for an empty token_log', function () {
        $run = makeRenderableRun([]);
        $dir = sys_get_temp_dir() . '/svg-test-' . uniqid();

        $paths = (new SvgFrameRenderer)->renderFrames($run, new RenderConfig(frameRate: 1), $dir);

        // EMPTY_FRAME_DURATION_MS=1000, frameRate=1 → ceil(1) × 1 = 1 frame.
        expect($paths)->toHaveCount(1);

        // Cleanup.
        array_map('unlink', $paths);
        @rmdir($dir);
    });

    it('shells out to `convert` once per frame', function () {
        $run = makeRenderableRun([tokenLogEntry('a', 1000)]);
        $dir = sys_get_temp_dir() . '/svg-test-' . uniqid();

        (new SvgFrameRenderer)->renderFrames($run, new RenderConfig(frameRate: 10), $dir);

        // 1000ms × 10 FPS = 10 frames → 10 convert invocations.
        Process::assertRanTimes(function (PendingProcess $p) {
            $cmd = is_array($p->command) ? implode(' ', $p->command) : (string) $p->command;

            return str_contains($cmd, 'convert');
        }, 10);

        array_map('unlink', glob($dir . '/*') ?: []);
        @rmdir($dir);
    });

    it('cleans up intermediate SVG files (only PNGs remain in the output dir)', function () {
        $run = makeRenderableRun([tokenLogEntry('a', 200), tokenLogEntry('b', 400)]);
        $dir = sys_get_temp_dir() . '/svg-test-' . uniqid();

        (new SvgFrameRenderer)->renderFrames($run, new RenderConfig(frameRate: 30), $dir);

        $svgs = glob($dir . '/*.svg');
        expect($svgs)->toBeEmpty();
        $pngs = glob($dir . '/*.png');
        expect(count($pngs))->toBeGreaterThan(0);

        array_map('unlink', $pngs ?: []);
        @rmdir($dir);
    });

    it('respects RenderConfig.maxFrames as an upper bound', function () {
        // A very long run truncated by maxFrames.
        $log = [];
        for ($i = 0; $i < 30; $i++) {
            $log[] = tokenLogEntry("t{$i}", $i * 1000, $i);
        }
        $run = makeRenderableRun($log);
        $dir = sys_get_temp_dir() . '/svg-test-' . uniqid();

        // 30 FPS × 100ms cap = 3 frames max.
        $config = new RenderConfig(frameRate: 30, maxDurationMs: 100);
        $paths = (new SvgFrameRenderer)->renderFrames($run, $config, $dir);

        expect(count($paths))->toBeLessThanOrEqual(3);

        array_map('unlink', $paths);
        @rmdir($dir);
    });

    it('throws RuntimeException when `convert` fails', function () {
        Process::fake([
            'convert*' => Process::result(output: '', errorOutput: 'no input', exitCode: 1),
        ]);

        $run = makeRenderableRun([tokenLogEntry('a', 100)]);
        $dir = sys_get_temp_dir() . '/svg-test-' . uniqid();

        expect(fn () => (new SvgFrameRenderer)->renderFrames($run, new RenderConfig, $dir))
            ->toThrow(RuntimeException::class, 'convert failed');

        array_map('unlink', glob($dir . '/*') ?: []);
        @rmdir($dir);
    });
});
