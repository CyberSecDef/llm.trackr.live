<?php

namespace App\Services\Llm\Clients;

use App\Models\ApiKey;

/**
 * xAI (Grok). OpenAI-compatible chat-completions surface at api.x.ai/v1.
 * Bearer auth; same SSE shape; supports logprobs.
 */
class XaiClient extends OpenAiClient
{
    public function vendor(): string
    {
        return 'xai';
    }

    protected function defaultBaseUrl(): string
    {
        return (string) config('services.xai.base_url', 'https://api.x.ai/v1');
    }

    /** xAI doesn't accept the OpenAI-Organization header. */
    protected function extraHeaders(ApiKey $apiKey): array
    {
        return [];
    }
}
