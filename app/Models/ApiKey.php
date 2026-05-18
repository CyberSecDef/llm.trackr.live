<?php

namespace App\Models;

use Database\Factories\ApiKeyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's API key for a vendor.
 *
 * Keys are encrypted at rest via Eloquent's `encrypted` cast. Setting
 * `encrypted_key` via the model accessor takes a plaintext string;
 * Eloquent encrypts it on save and decrypts on load. The cached
 * `last_four` is recomputed automatically whenever the plaintext
 * changes — never set it by hand.
 *
 * Use `forUserAndVendor` to fetch a key for the vendor-client layer.
 */
class ApiKey extends Model
{
    /** @use HasFactory<ApiKeyFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'vendor',
        'label',
        'encrypted_key',
        'last_used_at',
    ];

    protected $hidden = [
        'encrypted_key',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'encrypted_key' => 'encrypted',
            'last_used_at' => 'datetime',
        ];
    }

    /**
     * Recompute `last_four` whenever the plaintext key changes. Using
     * a model event keeps the invariant intact even if the cast layer
     * is bypassed via mass-assignment.
     */
    protected static function booted(): void
    {
        static::saving(function (self $apiKey) {
            if ($apiKey->isDirty('encrypted_key')) {
                $plaintext = $apiKey->encrypted_key;
                $apiKey->last_four = $plaintext === null || strlen($plaintext) < 4
                    ? str_pad($plaintext ?? '', 4, '•', STR_PAD_LEFT)
                    : substr($plaintext, -4);
            }
        });
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function maskedDisplay(): string
    {
        return '••••' . $this->last_four;
    }

    public function touchUsed(): void
    {
        $this->forceFill(['last_used_at' => now()])->saveQuietly();
    }
}
