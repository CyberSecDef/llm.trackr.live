<?php

namespace App\Services\Exports;

/**
 * Configuration for a single GIF/MP4 render (M10 chunk 1).
 *
 * Defaults match the M10 task list:
 *   - 30 FPS (matches the M8 animation target)
 *   - 5-minute per-export timeout — used as both a frame-count
 *     cap and a wall-clock guardrail downstream.
 *
 * Immutable value object. Chunks 2 (SVG renderer) and 4
 * (Puppeteer renderer) consume this; the job constructs a default
 * instance and individual call sites can override via `with*`.
 */
final class RenderConfig
{
    public function __construct(
        public readonly int $frameRate = 30,
        public readonly int $maxDurationMs = 300_000,
    ) {}

    public function withFrameRate(int $frameRate): self
    {
        return new self($frameRate, $this->maxDurationMs);
    }

    public function withMaxDurationMs(int $maxDurationMs): self
    {
        return new self($this->frameRate, $maxDurationMs);
    }

    public function maxFrames(): int
    {
        return (int) round($this->frameRate * ($this->maxDurationMs / 1000));
    }
}
