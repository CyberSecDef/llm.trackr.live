<?php

namespace App\Models;

use App\Enums\RunStatus;
use Database\Factories\RunFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One inference invocation against a vendor — a single user turn
 * inside a thread.
 *
 * Created in `pending` state by RunService::submit (M5 chunk 4).
 * M6's streaming pipeline drives it through `streaming` → `complete`
 * or `error`. Once terminal, `token_log` is the canonical replay
 * source — `Pages/Threads/Run/Replay.tsx` (M9) reads from it without
 * re-calling the vendor API.
 *
 * The `prompt` column is nullable to honor the user-level
 * `store_prompts` privacy opt-out (SPEC §10.4). `prompt_hash` is
 * always populated so replay's deterministic-PRNG seed survives
 * the redaction.
 */
class Run extends Model
{
    /** @use HasFactory<RunFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'thread_id',
        'user_id',
        'model_id',
        'sequence_in_thread',
        'prompt',
        'prompt_hash',
        'conversation_history',
        'parameters',
        'token_log',
        'output_text',
        'input_tokens',
        'output_tokens',
        'duration_ms',
        'tokens_per_second',
        'estimated_cost',
        'status',
        'error_message',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'sequence_in_thread' => 'integer',
            'conversation_history' => 'array',
            'parameters' => 'array',
            'token_log' => 'array',
            'input_tokens' => 'integer',
            'output_tokens' => 'integer',
            'duration_ms' => 'integer',
            'tokens_per_second' => 'float',
            'estimated_cost' => 'float',
            'status' => RunStatus::class,
        ];
    }

    /** @return BelongsTo<Thread, $this> */
    public function thread(): BelongsTo
    {
        return $this->belongsTo(Thread::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<LlmModel, $this> */
    public function model(): BelongsTo
    {
        return $this->belongsTo(LlmModel::class);
    }

    public function isTerminal(): bool
    {
        return $this->status->isTerminal();
    }
}
