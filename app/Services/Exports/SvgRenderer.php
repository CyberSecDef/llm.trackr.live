<?php

namespace App\Services\Exports;

use App\Models\Run;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * GifRenderer implementation that uses an `SvgFrameRenderer` to
 * emit PNG frames then a `VideoEncoder` to produce the final
 * GIF/MP4 (M10 chunk 2).
 *
 * Orchestrator only — no rendering or encoding logic lives here.
 * Lifecycle:
 *   1. Create a tmp scratch dir for the PNG sequence.
 *   2. Hand it to `SvgFrameRenderer::renderFrames` (chunk 2).
 *   3. Hand the resulting paths to `VideoEncoder::encode`
 *      (chunk 3's `FfmpegEncoder`; chunk 2 wires `NullVideoEncoder`
 *      which throws — the operator sees the chunk-3 gap in the
 *      failed_jobs message).
 *   4. Clean up the tmp dir on success.
 *
 * The renderer + encoder are injected so chunk 4's Puppeteer
 * renderer can reuse `VideoEncoder` and chunk 6's fallback path
 * can swap `FrameRenderer` based on Chromium availability.
 */
class SvgRenderer implements GifRenderer
{
    public function __construct(
        private readonly FrameRenderer $frameRenderer,
        private readonly VideoEncoder $encoder,
        private readonly ExportStorage $storage,
    ) {}

    public function render(Run $run, RenderConfig $config): RenderResult
    {
        $disk = $this->storage->disk();
        $gifPath = $this->storage->gifPath($run->id);
        $mp4Path = $this->storage->mp4Path($run->id);

        $tmpDir = $this->makeTmpDir($run->id);

        try {
            $frames = $this->frameRenderer->renderFrames($run, $config, $tmpDir);

            if ($frames === []) {
                throw new RuntimeException("Frame renderer produced no frames for run {$run->id}");
            }

            // The encoder writes the final artifacts to absolute
            // local paths first; we move them onto the configured
            // disk after. Chunks 3's FfmpegEncoder will do the
            // local-write itself — passing storage paths through
            // is just the contract.
            $this->encoder->encode($frames, $gifPath, $mp4Path, $config);

            $framesCount = count($frames);
            $durationMs = (int) round(($framesCount / $config->frameRate) * 1000);

            return new RenderResult(
                gifPath: $gifPath,
                mp4Path: $mp4Path,
                framesCount: $framesCount,
                durationMs: $durationMs,
            );
        } finally {
            $this->cleanup($tmpDir);
        }
    }

    private function makeTmpDir(int $runId): string
    {
        $base = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'llm-trackr-export-' . $runId . '-' . uniqid();
        if (! mkdir($base, 0755, true) && ! is_dir($base)) {
            throw new RuntimeException("Failed to create tmp dir: {$base}");
        }

        return $base;
    }

    private function cleanup(string $tmpDir): void
    {
        if (! is_dir($tmpDir)) {
            return;
        }
        foreach (glob($tmpDir . '/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($tmpDir);
    }
}
