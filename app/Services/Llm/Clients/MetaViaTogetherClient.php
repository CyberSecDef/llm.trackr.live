<?php

namespace App\Services\Llm\Clients;

/**
 * Meta (Llama) models served through Together.ai.
 *
 * Thin wrapper around TogetherClient — same endpoint, same auth,
 * same payload shape. Exists as a separate `vendor()` so the model
 * registry can list Llama models under vendor='meta' (matching the
 * SPEC §7 launch set) while still routing to Together's API.
 *
 * Key resolution: the M5/M6 run-submission layer is responsible for
 * picking the right ApiKey to pass — typically the user's Together
 * key. A possible UX improvement: if the user has no `meta` key but
 * has a `together` key, fall back to that. Deferred to M5.
 */
class MetaViaTogetherClient extends TogetherClient
{
    public function vendor(): string
    {
        return 'meta';
    }
}
