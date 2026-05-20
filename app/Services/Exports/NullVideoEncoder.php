<?php

namespace App\Services\Exports;

use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Scaffolding video encoder for M10 chunks 1–2.
 *
 * The real `FfmpegEncoder` lands in chunk 3. Until then,
 * `NullVideoEncoder::encode()` logs the call shape (so an
 * operator sees the pipeline ran), then throws — mirrors the
 * chunk-1 NullRenderer pattern: misconfigurations land in
 * `failed_jobs`, not as silent empty files.
 *
 * Tests that exercise the SvgRenderer end-to-end inject a
 * FakeVideoEncoder instead; this stub is only the dev-error path.
 */
final class NullVideoEncoder implements VideoEncoder
{
    public function encode(
        array $framePaths,
        string $gifPath,
        string $mp4Path,
        RenderConfig $config,
    ): void {
        Log::warning('NullVideoEncoder invoked — chunk 3 not yet wired', [
            'frame_count' => count($framePaths),
            'gif_path' => $gifPath,
            'mp4_path' => $mp4Path,
            'frame_rate' => $config->frameRate,
        ]);

        throw new RuntimeException(
            'Video encoder not yet implemented. Chunk 3 lands the ffmpeg shell-out.',
        );
    }
}
