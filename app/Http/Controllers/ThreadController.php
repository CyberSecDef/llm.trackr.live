<?php

namespace App\Http\Controllers;

use App\Models\Thread;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * /threads (M7 chunk 4).
 *
 * index: paginated list of the signed-in user's threads with search,
 *   archive, and tag filtering.
 * store: create an empty thread, redirect to its detail page. The
 *   detail page lands in chunk 5; until then the redirect target is
 *   a placeholder ComingSoon route registered alongside this one.
 *
 * Archive/share/delete actions defer to chunk 5 — they're per-thread
 * concerns and live more naturally on the detail page.
 *
 * Per-user isolation: every query is scoped to `$user->id`. Cross-
 * user queries cannot leak through any filter combination.
 */
class ThreadController extends Controller
{
    private const PER_PAGE = 20;

    public function index(Request $request): Response
    {
        $user = $request->user();

        $q = trim((string) $request->query('q', ''));
        $archived = (string) $request->query('archived', 'false');
        $tag = (string) $request->query('tag', '');

        $query = Thread::query()
            ->where('user_id', $user->id)
            ->withCount('runs')
            ->orderByDesc('last_activity_at')
            ->orderByDesc('id');

        // Archive filter — default to hiding archived threads.
        if ($archived === 'true') {
            $query->where('archived', true);
        } elseif ($archived !== 'all') {
            $query->where('archived', false);
        }

        if ($q !== '') {
            $query->where('title', 'like', '%' . $q . '%');
        }

        if ($tag !== '') {
            // SQLite + Postgres both support whereJsonContains via
            // Laravel's grammar (encodes as JSON_EXTRACT under the hood).
            $query->whereJsonContains('tags', $tag);
        }

        $threads = $query->paginate(self::PER_PAGE)->withQueryString();

        return Inertia::render('Threads/Index', [
            'threads' => [
                'data' => $threads->getCollection()->map(fn (Thread $thread) => [
                    'id' => $thread->id,
                    'title' => $thread->title,
                    'last_activity_at' => $thread->last_activity_at?->toIso8601String(),
                    'run_count' => $thread->runs_count,
                    'archived' => (bool) $thread->archived,
                    'tags' => $thread->tags ?? [],
                ]),
                'current_page' => $threads->currentPage(),
                'last_page' => $threads->lastPage(),
                'total' => $threads->total(),
                'per_page' => $threads->perPage(),
            ],
            'filters' => [
                'q' => $q,
                'archived' => $archived,
                'tag' => $tag,
            ],
            'available_tags' => $this->availableTags($user->id),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $thread = $request->user()->threads()->create([
            'title' => null,
            'system_prompt' => null,
            'default_model_id' => null,
            'default_parameters' => null,
            'archived' => false,
            'tags' => null,
            'last_activity_at' => now(),
        ]);

        return redirect()->route('threads.show', ['thread' => $thread->id]);
    }

    /**
     * Distinct tags across the user's threads. Returned as a sorted
     * unique list for the filter dropdown.
     *
     * @return list<string>
     */
    private function availableTags(int $userId): array
    {
        $rows = Thread::query()
            ->where('user_id', $userId)
            ->whereNotNull('tags')
            ->pluck('tags')
            ->toArray();

        $tags = [];
        foreach ($rows as $row) {
            // The `tags` cast returns an array; defensive against
            // legacy / hand-edited rows that might be strings.
            if (! is_array($row)) {
                continue;
            }
            foreach ($row as $tag) {
                if (is_string($tag) && $tag !== '') {
                    $tags[$tag] = true;
                }
            }
        }
        $sorted = array_keys($tags);
        sort($sorted);

        return $sorted;
    }
}
