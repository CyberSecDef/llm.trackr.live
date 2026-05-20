<?php

namespace App\Http\Controllers;

use App\Models\Thread;
use App\Services\Threads\ShareTokenGenerator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * POST/DELETE /threads/{thread}/share (M11 chunk 1).
 *
 * Toggles a thread's read-only public share state:
 *
 *   - `store()` enables sharing. Always generates a fresh token per
 *     the chunk-1 decision: an old link stays dead after a
 *     disable/re-enable cycle, which is the safe default if an
 *     accidentally-shared URL needs to be revoked.
 *   - `destroy()` disables sharing. Nulls both the token and the
 *     `share_enabled_at` timestamp. Idempotent — calling DELETE on
 *     an already-unshared thread is a no-op redirect, not a 404,
 *     so the UI's toggle off-state stays predictable across stale
 *     tabs.
 *
 * Both routes are owner-only (same invariant the rest of the
 * thread-detail controllers enforce). Inertia redirect responses
 * match the chunk-1 decision; the share-toggle UI re-renders
 * from the updated thread props.
 */
class ThreadShareController extends Controller
{
    public function __construct(private readonly ShareTokenGenerator $generator) {}

    public function store(Request $request, Thread $thread): RedirectResponse
    {
        abort_unless($thread->user_id === $request->user()->id, 403);

        $thread->update([
            'share_token' => $this->generator->generate(),
            'share_enabled_at' => now(),
        ]);

        return redirect()->route('threads.show', ['thread' => $thread->id]);
    }

    public function destroy(Request $request, Thread $thread): RedirectResponse
    {
        abort_unless($thread->user_id === $request->user()->id, 403);

        $thread->update([
            'share_token' => null,
            'share_enabled_at' => null,
        ]);

        return redirect()->route('threads.show', ['thread' => $thread->id]);
    }
}
