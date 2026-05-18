<?php

namespace App\Services\OpenRouter;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Thin client for OpenRouter's public /models endpoint.
 *
 * We don't use OpenRouter for inference — vendor APIs are called directly
 * under the BYOK model (SPEC §3.4). OpenRouter is our upstream metadata
 * source for the model registry: it covers most vendors with current
 * pricing and context-window data, refreshed weekly by the
 * ModelRegistryRefreshService.
 */
class OpenRouterClient
{
    public function __construct(
        private readonly ?string $baseUrl = null,
    ) {}

    /**
     * Fetch the full model catalog from OpenRouter.
     *
     * Normalizes each row into our domain shape:
     *   - splits "vendor/model" id into vendor + name
     *   - converts per-token pricing to per-million-tokens
     *   - extracts display name + context length
     *
     * @return list<array{
     *     vendor: string,
     *     name: string,
     *     display_name: string|null,
     *     context_length: int|null,
     *     pricing_input_per_million: float|null,
     *     pricing_output_per_million: float|null,
     * }>
     */
    public function fetchModels(): array
    {
        $base = $this->baseUrl ?? config('services.openrouter.base_url', 'https://openrouter.ai/api/v1');

        $response = Http::acceptJson()
            ->timeout(30)
            ->get(rtrim($base, '/') . '/models');

        if ($response->failed()) {
            throw new RuntimeException(
                "OpenRouter /models returned HTTP {$response->status()}",
            );
        }

        $body = $response->json();

        if (! is_array($body) || ! isset($body['data']) || ! is_array($body['data'])) {
            throw new RuntimeException(
                'OpenRouter /models response missing the `data` array',
            );
        }

        $normalized = [];
        foreach ($body['data'] as $row) {
            $normalized[] = $this->normalize($row);
        }

        return array_values(array_filter($normalized));
    }

    /**
     * Convert one OpenRouter row to our shape. Returns null when the id
     * isn't parseable.
     *
     * @param  array<string, mixed>  $row
     * @return array{
     *     vendor: string,
     *     name: string,
     *     display_name: string|null,
     *     context_length: int|null,
     *     pricing_input_per_million: float|null,
     *     pricing_output_per_million: float|null,
     * }|null
     */
    private function normalize(array $row): ?array
    {
        $id = $row['id'] ?? null;
        if (! is_string($id) || ! str_contains($id, '/')) {
            return null;
        }

        [$vendor, $name] = explode('/', $id, 2);

        // OpenRouter pricing fields are dollars-per-token as strings.
        // Multiply by 1e6 → dollars per million tokens (our SPEC shape).
        $pricing = $row['pricing'] ?? [];
        $prompt = isset($pricing['prompt']) ? (float) $pricing['prompt'] : null;
        $completion = isset($pricing['completion']) ? (float) $pricing['completion'] : null;

        return [
            'vendor' => $vendor,
            'name' => $name,
            'display_name' => isset($row['name']) && is_string($row['name']) ? $row['name'] : null,
            'context_length' => isset($row['context_length']) ? (int) $row['context_length'] : null,
            'pricing_input_per_million' => $prompt !== null ? $prompt * 1_000_000 : null,
            'pricing_output_per_million' => $completion !== null ? $completion * 1_000_000 : null,
        ];
    }
}
