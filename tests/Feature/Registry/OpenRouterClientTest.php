<?php

use App\Services\OpenRouter\OpenRouterClient;
use Illuminate\Support\Facades\Http;

it('fetches and normalizes the OpenRouter models endpoint', function () {
    Http::fake([
        '*/api/v1/models' => Http::response([
            'data' => [
                [
                    'id' => 'openai/gpt-4o',
                    'name' => 'OpenAI: GPT-4o',
                    'context_length' => 128000,
                    'pricing' => ['prompt' => '0.0000025', 'completion' => '0.00001'],
                ],
                [
                    'id' => 'anthropic/claude-3-5-sonnet',
                    'name' => 'Anthropic: Claude 3.5 Sonnet',
                    'context_length' => 200000,
                    'pricing' => ['prompt' => '0.000003', 'completion' => '0.000015'],
                ],
            ],
        ]),
    ]);

    $client = new OpenRouterClient;
    $models = $client->fetchModels();

    expect($models)->toHaveCount(2);

    expect($models[0])->toBe([
        'vendor' => 'openai',
        'name' => 'gpt-4o',
        'display_name' => 'OpenAI: GPT-4o',
        'context_length' => 128000,
        'pricing_input_per_million' => 2.5,
        'pricing_output_per_million' => 10.0,
    ]);

    expect($models[1]['vendor'])->toBe('anthropic');
    expect($models[1]['name'])->toBe('claude-3-5-sonnet');
    expect($models[1]['pricing_input_per_million'])->toBe(3.0);
});

it('skips rows with unparseable ids', function () {
    Http::fake([
        '*/api/v1/models' => Http::response([
            'data' => [
                ['id' => 'openai/gpt-4o', 'pricing' => []],
                ['id' => 'no-slash-id', 'pricing' => []],
                ['id' => null, 'pricing' => []],
                ['name' => 'missing-id-entirely'],
            ],
        ]),
    ]);

    $models = (new OpenRouterClient)->fetchModels();

    expect($models)->toHaveCount(1);
    expect($models[0]['vendor'])->toBe('openai');
});

it('throws when the HTTP request fails', function () {
    Http::fake([
        '*/api/v1/models' => Http::response('Service Unavailable', 503),
    ]);

    expect(fn () => (new OpenRouterClient)->fetchModels())
        ->toThrow(RuntimeException::class, 'HTTP 503');
});

it('throws when the response body is missing data array', function () {
    Http::fake([
        '*/api/v1/models' => Http::response(['not_data' => 'oops']),
    ]);

    expect(fn () => (new OpenRouterClient)->fetchModels())
        ->toThrow(RuntimeException::class, 'missing the `data` array');
});

it('handles missing pricing fields gracefully', function () {
    Http::fake([
        '*/api/v1/models' => Http::response([
            'data' => [
                ['id' => 'meta/llama-3.1-70b', 'context_length' => 128000],
            ],
        ]),
    ]);

    $models = (new OpenRouterClient)->fetchModels();

    expect($models[0]['pricing_input_per_million'])->toBeNull();
    expect($models[0]['pricing_output_per_million'])->toBeNull();
});
