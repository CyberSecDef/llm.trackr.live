<?php

namespace App\Services\Runs;

use App\Models\Thread;

/**
 * Serializes a Thread + its full run history into the chunk-4
 * JSON-export payload.
 *
 * Schema 1.0 — top-level fields:
 *   - schema_version: "1.0" (shared with single-run export so
 *     consumers can dispatch on this single field)
 *   - exported_at: ISO8601 timestamp
 *   - thread: { id, title, tags, archived, created_at, last_activity_at }
 *   - runs: list of run-section objects, ordered by
 *     sequence_in_thread asc. Each entry uses
 *     RunExportSerializer::runSection so the per-run shape is
 *     byte-equal to the chunk-3 single-run export's `run` field.
 *
 * Per chunk-4 decision, all runs are included regardless of status.
 * In-flight runs surface with partial data (status='pending'/
 * 'streaming', token_log may be empty); that's honest. Mirrors the
 * chunk-3 single-run endpoint's policy.
 */
class ThreadExportSerializer
{
    public const SCHEMA_VERSION = '1.0';

    public function __construct(private readonly Thread $thread) {}

    /**
     * Build the export array. Stable shape across calls except
     * for `exported_at`.
     *
     * @return array<string, mixed>
     */
    public function build(): array
    {
        $thread = $this->thread;
        $runs = $thread->runs()
            ->orderBy('sequence_in_thread')
            ->orderBy('id')
            ->get();

        return [
            'schema_version' => self::SCHEMA_VERSION,
            'exported_at' => now()->toIso8601String(),
            'thread' => [
                'id' => $thread->id,
                'title' => $thread->title,
                'tags' => $thread->tags ?? [],
                'archived' => (bool) $thread->archived,
                'created_at' => $thread->created_at?->toIso8601String(),
                'last_activity_at' => $thread->last_activity_at?->toIso8601String(),
            ],
            'runs' => $runs->map(fn ($run) => RunExportSerializer::runSection($run))
                ->all(),
        ];
    }
}
