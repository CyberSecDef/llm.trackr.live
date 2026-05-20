<?php

namespace App\Http\Controllers;

use App\Models\Run;
use App\Services\Exports\ExportStorage;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /runs/{run}/exports/{format} (M10 chunk 5).
 *
 * Owner-only file download for `.gif` and `.mp4` exports. The
 * `format` route parameter is `gif` or `mp4`; anything else is a
 * 422. The file's served from the configured `gif_export.storage_disk`
 * via `Storage::download()` so the same controller works against
 * the local filesystem in dev + S3 in prod without changes.
 *
 * Companion to `ExportTriggerController` (which produces the URLs
 * the frontend hits here).
 */
class ExportDownloadController extends Controller
{
    public function __construct(private readonly ExportStorage $storage) {}

    public function show(Request $request, Run $run, string $format): StreamedResponse
    {
        abort_unless($run->user_id === $request->user()->id, 403);
        abort_unless(in_array($format, ['gif', 'mp4'], true), 422);

        $path = $format === 'gif'
            ? $this->storage->gifPath($run->id)
            : $this->storage->mp4Path($run->id);

        $disk = $this->storage->disk();
        abort_unless($disk->exists($path), 404);

        $filename = "run-{$run->id}.{$format}";
        $contentType = $format === 'gif' ? 'image/gif' : 'video/mp4';

        return $disk->download($path, $filename, [
            'Content-Type' => $contentType,
        ]);
    }
}
