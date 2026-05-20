<?php

namespace App\Services\Exports;

/**
 * Result of a successful GIF/MP4 render (M10 chunk 1).
 *
 * `gifPath` + `mp4Path` are storage-disk relative paths (e.g.
 * "exports/123.gif"). Both formats are always produced together
 * from the same PNG sequence per the M10 spec — having both makes
 * the download chooser cheap (UI decides; renderer doesn't).
 *
 * `framesCount` + `durationMs` are surfaced for the WebSocket
 * completion event (chunk 5) so consumers know what they're
 * downloading without re-decoding the file.
 *
 * Immutable. Constructed only by a `GifRenderer::render()` call.
 */
final class RenderResult
{
    public function __construct(
        public readonly string $gifPath,
        public readonly string $mp4Path,
        public readonly int $framesCount,
        public readonly int $durationMs,
    ) {}
}
