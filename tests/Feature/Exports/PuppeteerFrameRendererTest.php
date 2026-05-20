<?php

use App\Models\Run;
use App\Services\Exports\ChromiumDetector;
use App\Services\Exports\ChromiumUnavailableException;
use App\Services\Exports\PuppeteerFrameRenderer;
use App\Services\Exports\RenderConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;

uses(RefreshDatabase::class);

class AlwaysFoundChromiumDetector extends ChromiumDetector
{
    public function findBinary(): ?string
    {
        return '/fake/chromium';
    }
}

class NeverFoundChromiumDetector extends ChromiumDetector
{
    public function findBinary(): ?string
    {
        return null;
    }
}

beforeEach(function () {
    putenv('CHROMIUM_PATH');
});

describe('PuppeteerFrameRenderer — fallback-detection paths', function () {
    it('throws ChromiumUnavailableException when no Chromium is found', function () {
        $renderer = new PuppeteerFrameRenderer(
            new NeverFoundChromiumDetector,
            '/tmp/never-exists.cjs',
        );
        $run = Run::factory()->create();

        expect(fn () => $renderer->renderFrames($run, new RenderConfig, sys_get_temp_dir()))
            ->toThrow(ChromiumUnavailableException::class, 'Chromium binary');
    });

    it('throws RuntimeException (not ChromiumUnavailableException) when Node script is missing', function () {
        $renderer = new PuppeteerFrameRenderer(
            new AlwaysFoundChromiumDetector,
            '/nonexistent/puppeteer-export.cjs',
        );
        $run = Run::factory()->create();

        try {
            $renderer->renderFrames($run, new RenderConfig, sys_get_temp_dir());
            expect()->fail('expected throw');
        } catch (RuntimeException $e) {
            expect($e)->not->toBeInstanceOf(ChromiumUnavailableException::class);
            expect($e->getMessage())->toContain('Node script not found');
            expect($e->getMessage())->toContain('GIF_RENDERER=svg');
        }
    });
});

describe('PuppeteerFrameRenderer — Node shell-out contract', function () {
    it('shells out to `node {script} --run --out --fps --max-ms --chromium`', function () {
        // Stage a fake Node script so the existence check passes.
        $scriptPath = tempnam(sys_get_temp_dir(), 'puppeteer-script-');
        file_put_contents($scriptPath, "// fake\n");
        $outputDir = sys_get_temp_dir() . '/puppeteer-test-' . uniqid();
        @mkdir($outputDir);

        Process::fake([
            'node*' => function (PendingProcess $p) use ($outputDir) {
                // Simulate Node writing one PNG.
                file_put_contents($outputDir . '/frame-00000.png', 'PNG');

                return Process::result(output: '', errorOutput: '', exitCode: 0);
            },
        ]);

        $renderer = new PuppeteerFrameRenderer(new AlwaysFoundChromiumDetector, $scriptPath);
        $run = Run::factory()->create();

        $paths = $renderer->renderFrames(
            $run,
            new RenderConfig(frameRate: 24, maxDurationMs: 5000),
            $outputDir,
        );

        expect($paths)->toHaveCount(1);
        Process::assertRan(function (PendingProcess $p) use ($run) {
            $cmd = is_array($p->command) ? implode(' ', $p->command) : (string) $p->command;

            return str_starts_with($cmd, 'node ')
                && str_contains($cmd, "--run={$run->id}")
                && str_contains($cmd, '--fps=24')
                && str_contains($cmd, '--max-ms=5000')
                && str_contains($cmd, '--chromium=');
        });

        @unlink($scriptPath);
        foreach (glob($outputDir . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($outputDir);
    });

    it('throws when Node exits non-zero', function () {
        $scriptPath = tempnam(sys_get_temp_dir(), 'puppeteer-script-');
        file_put_contents($scriptPath, "// fake\n");
        $outputDir = sys_get_temp_dir() . '/puppeteer-test-' . uniqid();
        @mkdir($outputDir);

        Process::fake([
            'node*' => Process::result(output: '', errorOutput: 'node crashed', exitCode: 1),
        ]);

        $renderer = new PuppeteerFrameRenderer(new AlwaysFoundChromiumDetector, $scriptPath);
        $run = Run::factory()->create();

        expect(fn () => $renderer->renderFrames($run, new RenderConfig, $outputDir))
            ->toThrow(RuntimeException::class, 'puppeteer-export.cjs failed');

        @unlink($scriptPath);
        @rmdir($outputDir);
    });

    it('throws when Node exits 0 but produces no frames', function () {
        $scriptPath = tempnam(sys_get_temp_dir(), 'puppeteer-script-');
        file_put_contents($scriptPath, "// fake\n");
        $outputDir = sys_get_temp_dir() . '/puppeteer-test-' . uniqid();
        @mkdir($outputDir);

        Process::fake([
            'node*' => Process::result(output: '', errorOutput: '', exitCode: 0),
        ]);

        $renderer = new PuppeteerFrameRenderer(new AlwaysFoundChromiumDetector, $scriptPath);
        $run = Run::factory()->create();

        expect(fn () => $renderer->renderFrames($run, new RenderConfig, $outputDir))
            ->toThrow(RuntimeException::class, 'no frames');

        @unlink($scriptPath);
        @rmdir($outputDir);
    });
});
