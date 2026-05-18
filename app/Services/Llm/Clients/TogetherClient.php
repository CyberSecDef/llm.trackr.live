<?php

namespace App\Services\Llm\Clients;

use App\Models\ApiKey;

/**
 * Together.ai. OpenAI-compatible chat-completions at api.together.xyz/v1.
 * Bearer auth. Hosts many open-weights models (Llama family, Mixtral,
 * etc.) — also serves as the proxy backing MetaViaTogetherClient
 * (M4 chunk 5).
 */
class TogetherClient extends OpenAiClient
{
    public function vendor(): string
    {
        return 'together';
    }

    protected function defaultBaseUrl(): string
    {
        return (string) config('services.together.base_url', 'https://api.together.xyz/v1');
    }

    protected function extraHeaders(ApiKey $apiKey): array
    {
        return [];
    }
}
