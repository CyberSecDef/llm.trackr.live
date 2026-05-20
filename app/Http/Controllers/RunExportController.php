<?php

namespace App\Http\Controllers;

use App\Models\Run;
use App\Services\Runs\RunExportSerializer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /runs/{run}/export.json (M9 chunk 3).
 *
 * Owner-only JSON export of a single run. The payload shape lives
 * in `RunExportSerializer` (schema 1.0) — this controller is a
 * thin authz + Content-Disposition wrapper.
 *
 * Available for any run regardless of status; an in-flight
 * streaming run's export will reflect whatever's been persisted to
 * the DB at the moment of the call (token_log incrementally writes,
 * so the partial state is honest). Terminal runs export the full
 * canonical record.
 */
class RunExportController extends Controller
{
    public function show(Request $request, Run $run): JsonResponse
    {
        abort_unless($run->user_id === $request->user()->id, 403);

        $payload = (new RunExportSerializer($run))->build();

        return response()
            ->json($payload, 200, [], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            ->header('Content-Disposition', "attachment; filename=\"run-{$run->id}.json\"");
    }
}
