<?php

namespace App\Services\Exports;

use App\Models\Run;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Headless-Chrome frame renderer for the 3D-accurate export path
 * (M10 chunk 4 skeleton).
 *
 * Architecture (the parts that exist today vs. the parts deferred):
 *
 *   - [exists] Chromium detection via `ChromiumDetector`. Failure
 *     raises `ChromiumUnavailableException` so chunk 6's fallback
 *     path can catch + reroute to SVG.
 *   - [exists] Node script existence check at the configured
 *     `gif_export.node_script_path`. Missing script → generic
 *     RuntimeException, lands in failed_jobs.
 *   - [exists] Shell-out shape: `node <script> --run=<id> --out=<dir>
 *     --fps=<rate> --max-ms=<ms>`. The Node script is what would
 *     actually navigate to /runs/{id}/render?record=1 and capture
 *     canvas frames — chunk 4 lays the PHP-side contract; the JS
 *     side ships in a follow-up chunk.
 *   - [deferred] The Node script itself, the /render Laravel
 *     route, frontend record-mode props on Replay.tsx.
 *
 * Why the split: full headless-Chrome integration adds ~150MB
 * Chromium download + a Node runtime + a record-mode UI flow + an
 * auth-bypass mechanism for the spawned puppeteer. Per the
 * chunk-4 decision, the skeleton lets chunk 6 implement + test
 * the fallback path on top of a stable PHP-side surface; the
 * Node + UI side can land in a follow-up without re-architecting.
 */
class PuppeteerFrameRenderer implements FrameRenderer
{
    public function __construct(
        private readonly ChromiumDetector $chromium,
        private readonly string $nodeScriptPath,
    ) {}

    public function renderFrames(Run $run, RenderConfig $config, string $outputDir): array
    {
        $binary = $this->chromium->findBinary();
        if ($binary === null) {
            throw new ChromiumUnavailableException(
                'Puppeteer renderer requires a Chromium binary. Install one ('
                . 'apt install chromium-browser, snap install chromium, '
                . 'brew install --cask chromium) or set CHROMIUM_PATH. '
                . 'The chunk-6 fallback will route to the SVG renderer when '
                . 'this exception type is raised.',
            );
        }

        if (! is_file($this->nodeScriptPath)) {
            throw new RuntimeException(
                "Puppeteer renderer Node script not found at {$this->nodeScriptPath}. "
                . 'The script ships in a follow-up chunk; until then, set '
                . 'GIF_RENDERER=svg to use the default renderer.',
            );
        }

        if (! is_dir($outputDir) && ! @mkdir($outputDir, 0755, true) && ! is_dir($outputDir)) {
            throw new RuntimeException("Failed to create output dir: {$outputDir}");
        }

        $cmd = sprintf(
            'node %s --run=%d --out=%s --fps=%d --max-ms=%d --chromium=%s',
            escapeshellarg($this->nodeScriptPath),
            $run->id,
            escapeshellarg($outputDir),
            $config->frameRate,
            $config->maxDurationMs,
            escapeshellarg($binary),
        );

        Log::info('PuppeteerFrameRenderer: spawning Node child', [
            'run_id' => $run->id,
            'fps' => $config->frameRate,
            'output_dir' => $outputDir,
        ]);

        $result = Process::timeout($config->maxDurationMs / 1000 + 10)->run($cmd);
        if (! $result->successful()) {
            throw new RuntimeException(sprintf(
                'puppeteer-export.cjs failed (exit %d): %s',
                $result->exitCode() ?? -1,
                trim($result->errorOutput()),
            ));
        }

        // The Node script writes frame-00000.png, frame-00001.png, ...
        // into $outputDir. Glob + sort to return in time order.
        $paths = glob($outputDir . '/frame-*.png') ?: [];
        sort($paths);

        if ($paths === []) {
            throw new RuntimeException(
                'puppeteer-export.cjs exited 0 but produced no frames in ' . $outputDir,
            );
        }

        return $paths;
    }
}
