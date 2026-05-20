<?php

namespace App\Services\Runs;

use App\Models\Run;

/**
 * Serializes a Run into the JSON-export payload (M9 chunk 3).
 *
 * Schema 1.0 — top-level fields:
 *   - schema_version: "1.0"
 *   - exported_at: ISO8601 timestamp (server time at export)
 *   - thread: { id, title, tags }
 *   - run: full metadata + parameters + conversation_history + token_log
 *
 * Excluded by design:
 *   - user_id, api_key_id — exports shouldn't carry user identity.
 *     Future M11 sharing can use this same payload safely.
 *   - model_id — the live model row could be re-keyed or deleted;
 *     `run.parameters.model_snapshot` is the canonical source for
 *     model facts (per SPEC §10.1). Export includes the snapshot,
 *     not the FK.
 *
 * Privacy: when `users.store_prompts = false`, the DB already nulls
 * `prompt` and `conversation_history` at write time — the export
 * surfaces those nulls naturally; no extra redaction logic needed.
 *
 * Pure function — no side effects, no I/O. Re-callable.
 */
class RunExportSerializer
{
    public const SCHEMA_VERSION = '1.0';

    public function __construct(private readonly Run $run) {}

    /**
     * Build the export array. Stable shape across calls.
     *
     * @return array<string, mixed>
     */
    public function build(): array
    {
        $run = $this->run;
        $run->loadMissing('thread');
        $thread = $run->thread;

        return [
            'schema_version' => self::SCHEMA_VERSION,
            'exported_at' => now()->toIso8601String(),
            'thread' => $thread === null ? null : [
                'id' => $thread->id,
                'title' => $thread->title,
                'tags' => $thread->tags ?? [],
            ],
            'run' => [
                'id' => $run->id,
                'sequence_in_thread' => $run->sequence_in_thread,
                'status' => $run->status->value,
                'prompt' => $run->prompt,
                'output_text' => $run->output_text,
                'error_message' => $run->error_message,
                'input_tokens' => $run->input_tokens,
                'output_tokens' => $run->output_tokens,
                'duration_ms' => $run->duration_ms,
                'tokens_per_second' => $run->tokens_per_second,
                'estimated_cost' => $run->estimated_cost,
                // Parameters carry the model_snapshot — that's the
                // canonical replay source per SPEC §10.1. Keep verbatim.
                'parameters' => $run->parameters,
                'conversation_history' => $run->conversation_history,
                'token_log' => $run->token_log,
                'created_at' => $run->created_at?->toIso8601String(),
            ],
        ];
    }
}
