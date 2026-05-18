<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Simple key/value store for registry-refresh bookkeeping.
 * Used to track `last_successful_refresh_at`, last error message, etc.
 *
 * Convenience: `RegistryMeta::set('key', $value)` and `::get('key')`
 * abstract away the upsert + JSON cast plumbing.
 */
class RegistryMeta extends Model
{
    protected $table = 'registry_meta';

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    public const UPDATED_AT = 'updated_at';

    public const CREATED_AT = null;

    /** @var list<string> */
    protected $fillable = ['key', 'value'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'value' => 'array',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Read a single meta value by key. Returns null if unset.
     *
     * @return array<string, mixed>|null
     */
    public static function getValue(string $key): ?array
    {
        $row = static::find($key);

        return $row?->value;
    }

    /**
     * Upsert a meta value.
     *
     * Uses the query builder directly so identical-value writes still
     * bump updated_at — Eloquent's updateOrCreate skips the write when
     * model attributes are clean, which would defeat the "last refresh"
     * tracking we use this table for.
     *
     * @param  array<string, mixed>|null  $value
     */
    public static function setValue(string $key, ?array $value): void
    {
        static::query()->updateOrInsert(
            ['key' => $key],
            [
                'value' => $value === null ? null : json_encode($value),
                'updated_at' => now(),
            ],
        );
    }

    public static function forget(string $key): void
    {
        static::where('key', $key)->delete();
    }
}
