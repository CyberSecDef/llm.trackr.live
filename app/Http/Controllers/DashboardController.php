<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * GET /dashboard (M7 chunk 3).
 *
 * Aggregates the signed-in user's all-time stats plus a recent-
 * threads slice. Single endpoint, no live-streaming — page renders
 * on full load. M8 may add live wiring once a run is in flight.
 *
 * Stats are scoped to `$request->user()->id` — never expose cross-
 * user totals. Token and cost sums only count `complete` runs so
 * partial / errored runs don't inflate the figures (their token
 * counts may be incomplete and their cost is null).
 */
class DashboardController extends Controller
{
    /** How many recent threads to surface on the dashboard. */
    private const RECENT_THREAD_LIMIT = 5;

    public function index(Request $request): Response
    {
        $user = $request->user();

        $runs = Run::query()->where('user_id', $user->id);
        $completedRuns = (clone $runs)->where('status', RunStatus::Complete);

        $totalRuns = (clone $runs)->count();
        $totalInputTokens = (int) (clone $completedRuns)->sum('input_tokens');
        $totalOutputTokens = (int) (clone $completedRuns)->sum('output_tokens');
        $totalCost = (float) (clone $completedRuns)->sum('estimated_cost');

        $recentThreads = Thread::query()
            ->where('user_id', $user->id)
            ->orderByDesc('last_activity_at')
            ->limit(self::RECENT_THREAD_LIMIT)
            ->withCount('runs')
            ->get()
            ->map(fn (Thread $thread) => [
                'id' => $thread->id,
                'title' => $thread->title,
                'last_activity_at' => $thread->last_activity_at?->toIso8601String(),
                'run_count' => $thread->runs_count,
                'archived' => $thread->archived,
            ]);

        return Inertia::render('Dashboard', [
            'stats' => [
                'total_runs' => $totalRuns,
                'total_tokens' => $totalInputTokens + $totalOutputTokens,
                // Explicit float cast — SUM() on no rows returns the
                // literal `0` (int) which would type-fight a JS
                // `number | null` payload downstream.
                'total_cost' => (float) round($totalCost, 4),
            ],
            'recent_threads' => $recentThreads,
            'has_api_keys' => $user->apiKeys()->exists(),
        ]);
    }
}
