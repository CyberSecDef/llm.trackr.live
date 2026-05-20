<?php

namespace App\Http\Controllers;

use App\Models\Thread;
use App\Services\Runs\ThreadExportSerializer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /threads/{thread}/export.json (M9 chunk 4).
 *
 * Owner-only JSON export of an entire thread — metadata + the full
 * ordered run history. The per-run shape is byte-equal to the
 * chunk-3 single-run export's `run` field, so consumers that
 * understand one understand the other.
 *
 * Per chunk-4 decision, all runs are included regardless of
 * status. In-flight runs surface as `pending`/`streaming` with
 * whatever has been persisted to the DB at the moment of the call.
 */
class ThreadExportController extends Controller
{
    public function show(Request $request, Thread $thread): JsonResponse
    {
        abort_unless($thread->user_id === $request->user()->id, 403);

        $payload = (new ThreadExportSerializer($thread))->build();

        return response()
            ->json($payload, 200, [], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            ->header(
                'Content-Disposition',
                "attachment; filename=\"thread-{$thread->id}.json\"",
            );
    }
}
