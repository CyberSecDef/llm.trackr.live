<?php

namespace App\Http\Controllers;

use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
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
     * GET /threads/{thread} — thread detail (M7 chunk 5).
     *
     * Returns the thread, its runs in `sequence_in_thread` order, and
     * the subset of models the user can actually run (vendors they
     * have an API key for, with the Meta→Together fallback honored).
     * `has_api_keys` drives the empty-state copy in the prompt-input
     * footer.
     */
    public function show(Request $request, Thread $thread): Response
    {
        abort_unless($thread->user_id === $request->user()->id, 403);

        $runs = $thread->runs()
            ->orderBy('sequence_in_thread')
            ->get()
            ->map(fn (Run $run) => [
                'id' => $run->id,
                'sequence_in_thread' => $run->sequence_in_thread,
                'status' => $run->status->value,
                'prompt' => $run->prompt,
                'output_text' => $run->output_text,
                'error_message' => $run->error_message,
                'input_tokens' => $run->input_tokens,
                'output_tokens' => $run->output_tokens,
                'duration_ms' => $run->duration_ms,
                'estimated_cost' => $run->estimated_cost,
                'model_id' => $run->model_id,
                'created_at' => $run->created_at?->toIso8601String(),
            ]);

        return Inertia::render('Threads/Show', [
            'thread' => [
                'id' => $thread->id,
                'title' => $thread->title,
                'archived' => (bool) $thread->archived,
                'tags' => $thread->tags ?? [],
                'last_activity_at' => $thread->last_activity_at?->toIso8601String(),
                'created_at' => $thread->created_at?->toIso8601String(),
                'default_model_id' => $thread->default_model_id,
            ],
            'runs' => $runs,
            'usable_models' => $this->usableModels($request->user()),
            'has_api_keys' => $request->user()->apiKeys()->exists(),
        ]);
    }

    /**
     * PATCH /threads/{thread} — update title and/or archived flag.
     * Other thread fields (system_prompt, default_model_id, tags)
     * will get their own endpoints once their UI lands.
     */
    public function update(Request $request, Thread $thread): RedirectResponse
    {
        abort_unless($thread->user_id === $request->user()->id, 403);

        $validated = $request->validate([
            'title' => ['sometimes', 'nullable', 'string', 'max:200'],
            'archived' => ['sometimes', 'boolean'],
        ]);

        $thread->fill($validated)->save();

        return redirect()->back();
    }

    /**
     * DELETE /threads/{thread} — hard-delete. Runs cascade via the
     * `cascadeOnDelete` FK in the runs table; no application logic
     * needed beyond the ownership check.
     */
    public function destroy(Request $request, Thread $thread): RedirectResponse
    {
        abort_unless($thread->user_id === $request->user()->id, 403);

        $thread->delete();

        return redirect()->route('threads.index');
    }

    /**
     * Models the user could actually run right now — restricted to
     * vendors where they have an API key. Mirrors the Meta→Together
     * fallback from RunService::resolveApiKey so the dropdown doesn't
     * grey out a Meta model when the user has a Together key.
     *
     * @return list<array<string, mixed>>
     */
    private function usableModels(User $user): array
    {
        $vendors = $user->apiKeys()->pluck('vendor')->unique()->all();
        if (in_array('together', $vendors, true) && ! in_array('meta', $vendors, true)) {
            $vendors[] = 'meta';
        }
        if (empty($vendors)) {
            return [];
        }

        return LlmModel::query()
            ->whereIn('vendor', $vendors)
            ->orderBy('vendor')
            ->orderBy('display_name')
            ->get()
            ->map(fn (LlmModel $model) => [
                'id' => $model->id,
                'vendor' => $model->vendor,
                'name' => $model->name,
                'display_name' => $model->display_name,
                // Architecture + capacity fields needed by the M7
                // chunk-7 ModelPicker filters + MetadataCard.
                'architecture_type' => $model->architecture_type?->value,
                'position_encoding' => $model->position_encoding?->value,
                'layers' => $model->layers,
                'hidden_dim' => $model->hidden_dim,
                'attention_heads' => $model->attention_heads,
                'moe_experts' => $model->moe_experts,
                'moe_active_experts' => $model->moe_active_experts,
                'context_length' => $model->context_length,
                'pricing_input_per_million' => $model->pricing_input_per_million,
                'pricing_output_per_million' => $model->pricing_output_per_million,
                // supported_params drives the M7 chunk-8 inference-parameter
                // controls — disables sliders for params the vendor doesn't
                // accept on this model.
                'supported_params' => $model->supported_params,
            ])
            ->all();
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
