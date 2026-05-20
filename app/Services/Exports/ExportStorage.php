<?php

namespace App\Services\Exports;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;

/**
 * Storage paths + cache-hit checks for GIF/MP4 exports
 * (M10 chunk 1).
 *
 * Layout (relative to the `gif_export.storage_disk`):
 *   exports/{run_id}.gif
 *   exports/{run_id}.mp4
 *
 * Both formats are produced together from one PNG sequence
 * (chunk 3 ffmpeg shell-out) so cache checks examine BOTH files.
 * A partial render (gif present, mp4 missing — power loss
 * mid-encode, say) is treated as a cache miss and re-rendered.
 */
class ExportStorage
{
    public function __construct(private readonly ?string $diskName = null) {}

    public function gifPath(int $runId): string
    {
        return "exports/{$runId}.gif";
    }

    public function mp4Path(int $runId): string
    {
        return "exports/{$runId}.mp4";
    }

    public function hasGif(int $runId): bool
    {
        return $this->disk()->exists($this->gifPath($runId));
    }

    public function hasMp4(int $runId): bool
    {
        return $this->disk()->exists($this->mp4Path($runId));
    }

    /**
     * True only when BOTH files are present — partial renders are
     * a cache miss so the next dispatch re-renders cleanly.
     */
    public function bothExist(int $runId): bool
    {
        return $this->hasGif($runId) && $this->hasMp4($runId);
    }

    /**
     * The configured storage disk. Pulled lazily so config changes
     * across tests are picked up.
     */
    public function disk(): Filesystem
    {
        $name = $this->diskName ?? (string) config('gif_export.storage_disk', 'local');

        return Storage::disk($name);
    }
}
