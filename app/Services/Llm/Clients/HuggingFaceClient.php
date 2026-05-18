<?php

namespace App\Services\Llm\Clients;

use App\Models\ApiKey;

/**
 * HuggingFace Inference Endpoints client.
 *
 * **SPEC deviation:** the SPEC §3.2.2 task list called for the TGI
 * (text-generation-inference) native protocol. We use HF's
 * OpenAI-compatible chat-completions surface instead because:
 *   1. It handles the model's chat template server-side — no need
 *      for us to implement per-model jinja templating in PHP.
 *   2. The wire format is identical to OpenAI's, so SseParser and
 *      every other piece of OpenAiClient applies unchanged.
 *   3. Most managed HF Inference Endpoints expose this surface.
 *
 * Users with custom HF endpoints set `services.huggingface.base_url`
 * in env (e.g. https://my-endpoint.endpoints.huggingface.cloud/v1)
 * — there's no sensible global default since each deployment is
 * model-bound. Per-model overrides via `models.api_base_url` wire
 * in at M5/M6 when the run-submission layer resolves the model row.
 */
class HuggingFaceClient extends OpenAiClient
{
    public function vendor(): string
    {
        return 'huggingface';
    }

    protected function defaultBaseUrl(): string
    {
        return (string) config('services.huggingface.base_url', '');
    }

    protected function extraHeaders(ApiKey $apiKey): array
    {
        return [];
    }
}
