<?php

namespace App\Services\Llm\Clients;

use App\Models\ApiKey;

/**
 * Groq. OpenAI-compatible chat-completions at api.groq.com/openai/v1.
 * Bearer auth. Groq's LPU inference is markedly faster than typical
 * GPU vendors — useful for development + low-latency demos.
 */
class GroqClient extends OpenAiClient
{
    public function vendor(): string
    {
        return 'groq';
    }

    protected function defaultBaseUrl(): string
    {
        return (string) config('services.groq.base_url', 'https://api.groq.com/openai/v1');
    }

    protected function extraHeaders(ApiKey $apiKey): array
    {
        return [];
    }
}
