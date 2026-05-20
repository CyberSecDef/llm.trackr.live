<?php

namespace App\Services\Exports;

use RuntimeException;

/**
 * Contract for the PNG-sequence → GIF + MP4 encoder (M10 chunk 2).
 *
 * Lands its real implementation in chunk 3 (`FfmpegEncoder`,
 * shells out to ffmpeg). The interface stays minimal so chunk 4's
 * Puppeteer-driven path can reuse exactly the same encoder.
 *
 * Both formats are produced from the same PNG sequence in a single
 * encoder invocation — the chooser UI in chunk 5 picks which one
 * to download.
 */
interface VideoEncoder
{
    /**
     * Encode `$framePaths` into `$gifPath` and `$mp4Path` on the
     * configured export disk.
     *
     * @param  list<string>  $framePaths  Absolute PNG paths in playback order.
     * @param  string  $gifPath  Storage-relative path (`exports/{id}.gif`).
     * @param  string  $mp4Path  Storage-relative path (`exports/{id}.mp4`).
     *
     * @throws RuntimeException When encoding fails (ffmpeg missing,
     *                          zero frames, output disk full, etc.).
     */
    public function encode(
        array $framePaths,
        string $gifPath,
        string $mp4Path,
        RenderConfig $config,
    ): void;
}
