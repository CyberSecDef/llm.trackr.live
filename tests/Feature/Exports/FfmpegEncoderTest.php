<?php

use App\Services\Exports\ExportStorage;
use App\Services\Exports\FfmpegEncoder;
use App\Services\Exports\RenderConfig;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('local');
    config()->set('gif_export.storage_disk', 'local');

    // Stage some PNG frames in a tmp dir so the encoder can run
    // its file_exists guards + the fake closure has paths to mimic.
    $this->dir = sys_get_temp_dir() . '/ffmpeg-test-' . uniqid();
    @mkdir($this->dir);
    $this->framePaths = [];
    for ($i = 0; $i < 3; $i++) {
        $p = sprintf('%s/frame-%05d.png', $this->dir, $i);
        file_put_contents($p, 'PNG-stub');
        $this->framePaths[] = $p;
    }

    // Fake every ffmpeg invocation — writes a stub file at the
    // command's output path (last shell-arg) so the encoder's
    // file_exists checks + disk copies see realistic content.
    Process::fake([
        'ffmpeg*' => function (PendingProcess $p) {
            $cmd = is_array($p->command) ? implode(' ', $p->command) : (string) $p->command;
            if (preg_match("/'([^']+)'\\s*$/", $cmd, $m)) {
                @file_put_contents($m[1], 'stub-' . pathinfo($m[1], PATHINFO_EXTENSION));
            }

            return Process::result(output: '', errorOutput: '', exitCode: 0);
        },
    ]);
});

afterEach(function () {
    if (isset($this->dir) && is_dir($this->dir)) {
        foreach (glob($this->dir . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($this->dir);
    }
});

describe('FfmpegEncoder::encode', function () {
    it('throws when frames array is empty', function () {
        $encoder = new FfmpegEncoder(new ExportStorage);
        expect(fn () => $encoder->encode([], 'exports/1.gif', 'exports/1.mp4', new RenderConfig))
            ->toThrow(RuntimeException::class, 'no frames to encode');
    });

    it('runs three ffmpeg invocations (MP4, palettegen, paletteuse)', function () {
        $encoder = new FfmpegEncoder(new ExportStorage);
        $encoder->encode(
            $this->framePaths,
            'exports/42.gif',
            'exports/42.mp4',
            new RenderConfig(frameRate: 30),
        );

        Process::assertRanTimes(function (PendingProcess $p) {
            $cmd = is_array($p->command) ? implode(' ', $p->command) : (string) $p->command;

            return str_starts_with($cmd, 'ffmpeg');
        }, 3);
    });

    it('emits the libx264/yuv420p flags in the MP4 invocation', function () {
        $encoder = new FfmpegEncoder(new ExportStorage);
        $encoder->encode(
            $this->framePaths,
            'exports/42.gif',
            'exports/42.mp4',
            new RenderConfig,
        );

        Process::assertRan(function (PendingProcess $p) {
            $cmd = is_array($p->command) ? implode(' ', $p->command) : (string) $p->command;

            return str_contains($cmd, 'libx264')
                && str_contains($cmd, 'yuv420p')
                && str_contains($cmd, '+faststart');
        });
    });

    it('emits palettegen + paletteuse flags for the GIF passes', function () {
        $encoder = new FfmpegEncoder(new ExportStorage);
        $encoder->encode(
            $this->framePaths,
            'exports/42.gif',
            'exports/42.mp4',
            new RenderConfig,
        );

        Process::assertRan(function (PendingProcess $p) {
            $cmd = is_array($p->command) ? implode(' ', $p->command) : (string) $p->command;

            return str_contains($cmd, 'palettegen');
        });
        Process::assertRan(function (PendingProcess $p) {
            $cmd = is_array($p->command) ? implode(' ', $p->command) : (string) $p->command;

            return str_contains($cmd, 'paletteuse');
        });
    });

    it('passes the configured frame_rate to ffmpeg', function () {
        $encoder = new FfmpegEncoder(new ExportStorage);
        $encoder->encode(
            $this->framePaths,
            'exports/42.gif',
            'exports/42.mp4',
            new RenderConfig(frameRate: 24),
        );

        Process::assertRan(function (PendingProcess $p) {
            $cmd = is_array($p->command) ? implode(' ', $p->command) : (string) $p->command;

            return str_contains($cmd, '-framerate 24');
        });
    });

    it('writes the GIF and MP4 to the configured storage disk', function () {
        $encoder = new FfmpegEncoder(new ExportStorage);
        $encoder->encode(
            $this->framePaths,
            'exports/42.gif',
            'exports/42.mp4',
            new RenderConfig,
        );

        Storage::disk('local')->assertExists('exports/42.gif');
        Storage::disk('local')->assertExists('exports/42.mp4');
    });

    it('does NOT write to disk when MP4 pass fails (atomicity)', function () {
        Process::fake([
            // First ffmpeg call (MP4) fails; subsequent calls won't run.
            'ffmpeg*' => Process::result(output: '', errorOutput: 'cant', exitCode: 1),
        ]);

        $encoder = new FfmpegEncoder(new ExportStorage);
        expect(fn () => $encoder->encode(
            $this->framePaths,
            'exports/42.gif',
            'exports/42.mp4',
            new RenderConfig,
        ))->toThrow(RuntimeException::class, 'MP4 encoding');

        Storage::disk('local')->assertMissing('exports/42.gif');
        Storage::disk('local')->assertMissing('exports/42.mp4');
    });

    it('does NOT write to disk when GIF palette pass fails', function () {
        $callCount = 0;
        Process::fake([
            'ffmpeg*' => function () use (&$callCount) {
                $callCount++;
                if ($callCount === 1) {
                    // MP4 pass succeeds — write a stub tmp file.
                    return Process::result('', '', 0);
                }

                // palettegen pass fails.
                return Process::result('', 'palette err', 1);
            },
        ]);

        // Stage the MP4 tmp file that "pass 1" would normally produce.
        file_put_contents($this->dir . '/output.mp4', 'mp4-stub');

        $encoder = new FfmpegEncoder(new ExportStorage);
        expect(fn () => $encoder->encode(
            $this->framePaths,
            'exports/42.gif',
            'exports/42.mp4',
            new RenderConfig,
        ))->toThrow(RuntimeException::class, 'palette generation');

        Storage::disk('local')->assertMissing('exports/42.gif');
        Storage::disk('local')->assertMissing('exports/42.mp4');
    });

    it('reports which pass failed in the exception message', function () {
        Process::fake([
            'ffmpeg*' => Process::result('', 'specific ffmpeg error', 1),
        ]);

        $encoder = new FfmpegEncoder(new ExportStorage);
        try {
            $encoder->encode(
                $this->framePaths,
                'exports/42.gif',
                'exports/42.mp4',
                new RenderConfig,
            );
            expect()->fail('expected throw');
        } catch (RuntimeException $e) {
            $msg = $e->getMessage();
            expect($msg)->toContain('MP4 encoding');
            expect($msg)->toContain('specific ffmpeg error');
            expect($msg)->toContain('exit 1');
        }
    });

    it('throws when MP4 tmp file is missing after a successful ffmpeg pass', function () {
        // A degenerate fake — ffmpeg "succeeds" but doesn't produce
        // an output file. The encoder should catch this defensively.
        Process::fake([
            'ffmpeg*' => Process::result('', '', 0),
        ]);

        $encoder = new FfmpegEncoder(new ExportStorage);
        expect(fn () => $encoder->encode(
            $this->framePaths,
            'exports/42.gif',
            'exports/42.mp4',
            new RenderConfig,
        ))->toThrow(RuntimeException::class, 'expected MP4 not found');
    });
});
