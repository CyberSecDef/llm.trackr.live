<?php

namespace App\Services\Exports;

use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Encodes a PNG sequence into MP4 + GIF via ffmpeg shell-out
 * (M10 chunk 3).
 *
 * Three ffmpeg invocations per export (chunk-3 decision: separate
 * calls over a single -map graph — each failure localizes to one
 * format and the diagnostics are dramatically clearer):
 *
 *   1. PNG sequence → MP4
 *      - libx264 / yuv420p (the broadest web compatibility)
 *      - faststart (moov atom at file head, lets browsers start
 *        playing before the full file downloads)
 *      - scale=trunc(iw/2)*2:trunc(ih/2)*2 — x264 rejects odd
 *        dimensions; this rounds down to the nearest even pair.
 *
 *   2. PNG sequence → palette.png  (`palettegen stats_mode=full`)
 *      - Single 256-color palette derived from the entire run.
 *      - "full" stats_mode considers every pixel of every frame,
 *        which is right for a GIF that has to look good across
 *        bursts of colored particles + the dark UI panels.
 *
 *   3. PNG sequence + palette.png → GIF (`paletteuse`)
 *      - Bayer dithering at scale=3 — visually clean on smooth
 *        gradients (the embedding scatter cloud, the slate panel
 *        backgrounds) without the noisy "static" look of `none`.
 *      - `-loop 0` so the GIF replays forever when embedded in
 *        Slack, Discord, GitHub, etc.
 *
 * Atomicity: the storage-disk writes happen only after all three
 * passes succeed. A mid-pipeline failure leaves storage unchanged —
 * the next ExportRunGif dispatch is a cache miss + clean re-render.
 */
class FfmpegEncoder implements VideoEncoder
{
    public function __construct(private readonly ExportStorage $storage) {}

    public function encode(
        array $framePaths,
        string $gifPath,
        string $mp4Path,
        RenderConfig $config,
    ): void {
        if ($framePaths === []) {
            throw new RuntimeException('FfmpegEncoder: no frames to encode');
        }

        $dir = dirname($framePaths[0]);
        // The SvgFrameRenderer writes frame-00000.png, frame-00001.png, ...
        // — the sequence pattern ffmpeg expects.
        $pattern = $dir . DIRECTORY_SEPARATOR . 'frame-%05d.png';
        $fps = max(1, $config->frameRate);

        $mp4Tmp = $dir . DIRECTORY_SEPARATOR . 'output.mp4';
        $palettePath = $dir . DIRECTORY_SEPARATOR . 'palette.png';
        $gifTmp = $dir . DIRECTORY_SEPARATOR . 'output.gif';

        // Pass 1: PNG → MP4.
        $this->runFfmpeg(sprintf(
            'ffmpeg -y -framerate %d -i %s -c:v libx264 -pix_fmt yuv420p '
            . '-vf %s -movflags +faststart %s',
            $fps,
            escapeshellarg($pattern),
            escapeshellarg('scale=trunc(iw/2)*2:trunc(ih/2)*2'),
            escapeshellarg($mp4Tmp),
        ), 'MP4 encoding');

        // Pass 2: PNG → palette.
        $this->runFfmpeg(sprintf(
            'ffmpeg -y -framerate %d -i %s -vf %s %s',
            $fps,
            escapeshellarg($pattern),
            escapeshellarg('palettegen=stats_mode=full'),
            escapeshellarg($palettePath),
        ), 'GIF palette generation');

        // Pass 3: PNG + palette → GIF.
        $this->runFfmpeg(sprintf(
            'ffmpeg -y -framerate %d -i %s -i %s -filter_complex %s -loop 0 %s',
            $fps,
            escapeshellarg($pattern),
            escapeshellarg($palettePath),
            escapeshellarg('paletteuse=dither=bayer:bayer_scale=3'),
            escapeshellarg($gifTmp),
        ), 'GIF encoding');

        // Copy outputs to the configured storage disk only after
        // all three passes succeed (atomicity). file_get_contents
        // pulls the full file into memory — fine for our target
        // size class (~5-50MB per artifact).
        $disk = $this->storage->disk();
        if (! file_exists($mp4Tmp)) {
            throw new RuntimeException("FfmpegEncoder: expected MP4 not found at {$mp4Tmp}");
        }
        if (! file_exists($gifTmp)) {
            throw new RuntimeException("FfmpegEncoder: expected GIF not found at {$gifTmp}");
        }
        $disk->put($mp4Path, file_get_contents($mp4Tmp));
        $disk->put($gifPath, file_get_contents($gifTmp));
    }

    private function runFfmpeg(string $cmd, string $context): void
    {
        $result = Process::run($cmd);
        if (! $result->successful()) {
            throw new RuntimeException(sprintf(
                'ffmpeg failed (%s, exit %d): %s',
                $context,
                $result->exitCode() ?? -1,
                trim($result->errorOutput()),
            ));
        }
    }
}
