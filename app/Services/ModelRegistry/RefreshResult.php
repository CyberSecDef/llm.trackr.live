<?php

namespace App\Services\ModelRegistry;

/**
 * Summary of one ModelRegistryRefreshService::refresh() invocation.
 * Used by the artisan command and admin UI to report what happened.
 */
class RefreshResult
{
    /**
     * @param  list<string>  $errors  Per-row warnings (don't fail the whole refresh).
     */
    public function __construct(
        public readonly int $created,
        public readonly int $updated,
        public readonly int $skipped,
        public readonly int $total,
        public readonly array $errors = [],
    ) {}

    public function summary(): string
    {
        return sprintf(
            '%d models seen: %d created, %d updated, %d skipped (manual_override)',
            $this->total,
            $this->created,
            $this->updated,
            $this->skipped,
        );
    }
}
