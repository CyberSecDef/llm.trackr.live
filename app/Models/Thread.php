<?php

namespace App\Models;

use Database\Factories\ThreadFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A persistent multi-turn conversation (SPEC §3.5).
 *
 * Threads are linear in Phase 1 — no branching. Each run within a
 * thread inherits the thread's system_prompt + default_model_id +
 * default_parameters and prepends prior runs' (user, assistant)
 * turns as the conversation history sent to the vendor.
 *
 * `last_activity_at` is maintained by the ThreadService at run
 * submission time (M5 chunk 4) so the threads-list page can sort
 * by recency without N+1 queries against runs.
 */
class Thread extends Model
{
    /** @use HasFactory<ThreadFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'title',
        'system_prompt',
        'default_model_id',
        'default_parameters',
        'archived',
        'tags',
        'share_token',
        'share_enabled_at',
        'last_activity_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'default_parameters' => 'array',
            'archived' => 'boolean',
            'tags' => 'array',
            'share_enabled_at' => 'datetime',
            'last_activity_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<LlmModel, $this> */
    public function defaultModel(): BelongsTo
    {
        return $this->belongsTo(LlmModel::class, 'default_model_id');
    }

    /** @return HasMany<Run, $this> */
    public function runs(): HasMany
    {
        return $this->hasMany(Run::class)->orderBy('sequence_in_thread');
    }

    public function isShared(): bool
    {
        return $this->share_token !== null;
    }
}
