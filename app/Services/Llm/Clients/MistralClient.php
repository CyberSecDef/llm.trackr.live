<?php

namespace App\Services\Llm\Clients;

use App\Models\ApiKey;

/**
 * Mistral. OpenAI-compatible chat-completions at api.mistral.ai/v1.
 * Bearer auth. Mistral accepts an extra `safe_prompt` boolean — not
 * exposed in our params shape; callers wanting it can route through
 * the raw client.
 */
class MistralClient extends OpenAiClient
{
    public function vendor(): string
    {
        return 'mistral';
    }

    protected function defaultBaseUrl(): string
    {
        return (string) config('services.mistral.base_url', 'https://api.mistral.ai/v1');
    }

    protected function extraHeaders(ApiKey $apiKey): array
    {
        return [];
    }
}
