<?php

namespace App\Services\Threads;

use App\Models\Thread;
use App\Models\User;
use InvalidArgumentException;

/**
 * Thread CRUD-ish operations + small invariants the controller layer
 * would otherwise duplicate (title trimming, tag normalization, etc.).
 *
 * Deliberately stateless and Eloquent-thin. Authorization (does this
 * user own this thread?) is the caller's responsibility — Laravel
 * policies and controllers are the right home for that, not here.
 *
 * `last_activity_at` is NOT touched by these methods. Only
 * RunService::submit (M5 chunk 4) bumps it — archiving or renaming
 * a thread doesn't count as activity.
 */
class ThreadService
{
    /**
     * Create a new thread owned by $user.
     *
     * `title` stays null when not supplied so RunService::submit can
     * auto-fill it on the first run per SPEC §3.5 (first 60 chars of
     * the first prompt).
     *
     * @param  array{
     *     title?: string|null,
     *     system_prompt?: string|null,
     *     default_model_id?: int|null,
     *     default_parameters?: array<string, mixed>|null,
     *     tags?: list<string>|null,
     * }  $attributes
     */
    public function create(User $user, array $attributes = []): Thread
    {
        return $user->threads()->create([
            'title' => $this->normalizeTitle($attributes['title'] ?? null),
            'system_prompt' => $attributes['system_prompt'] ?? null,
            'default_model_id' => $attributes['default_model_id'] ?? null,
            'default_parameters' => $attributes['default_parameters'] ?? null,
            'tags' => $this->normalizeTags($attributes['tags'] ?? null),
            'archived' => false,
        ]);
    }

    public function rename(Thread $thread, string $title): Thread
    {
        $trimmed = trim($title);
        if ($trimmed === '') {
            throw new InvalidArgumentException('Thread title cannot be empty.');
        }

        $thread->update(['title' => $trimmed]);

        return $thread;
    }

    public function archive(Thread $thread): Thread
    {
        $thread->update(['archived' => true]);

        return $thread;
    }

    public function unarchive(Thread $thread): Thread
    {
        $thread->update(['archived' => false]);

        return $thread;
    }

    /**
     * Replace the thread's tags. Pass [] or null to clear.
     *
     * Normalizes: trims each tag, drops empty/whitespace-only entries,
     * dedupes case-sensitively. User casing is preserved (someone
     * tagging "AI-research" vs "ai-research" probably means them
     * differently).
     *
     * @param  list<string>|null  $tags
     */
    public function tag(Thread $thread, ?array $tags): Thread
    {
        $thread->update(['tags' => $this->normalizeTags($tags)]);

        return $thread;
    }

    public function delete(Thread $thread): void
    {
        // FK cascade drops the thread's runs automatically.
        $thread->delete();
    }

    /**
     * @param  list<string>|null  $tags
     * @return list<string>|null
     */
    private function normalizeTags(?array $tags): ?array
    {
        if ($tags === null) {
            return null;
        }

        $clean = [];
        foreach ($tags as $tag) {
            $t = trim((string) $tag);
            if ($t === '' || in_array($t, $clean, true)) {
                continue;
            }
            $clean[] = $t;
        }

        return $clean === [] ? null : $clean;
    }

    private function normalizeTitle(?string $title): ?string
    {
        if ($title === null) {
            return null;
        }
        $trimmed = trim($title);

        return $trimmed === '' ? null : $trimmed;
    }
}
