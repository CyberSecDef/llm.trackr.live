<?php

namespace App\Services\Threads;

/**
 * Generates the cryptographically random tokens that gate
 * `/share/{token}` URLs (M11 chunk 1).
 *
 * 16 bytes of `random_bytes` entropy → 32 hex chars. Collision
 * probability across the lifetime of the app is essentially zero
 * (2^64 expected before the first collision); we additionally
 * have a `UNIQUE` constraint on `threads.share_token` from the
 * M5 migration so any astronomical collision fails the INSERT
 * loudly.
 *
 * Wrapped in a class so tests can bind a fixed-output stub via
 * `$this->app->instance(ShareTokenGenerator::class, $fake)` —
 * matches the M10 chunk-2 pattern for FrameRenderer fakes.
 */
class ShareTokenGenerator
{
    public function generate(): string
    {
        return bin2hex(random_bytes(16));
    }
}
