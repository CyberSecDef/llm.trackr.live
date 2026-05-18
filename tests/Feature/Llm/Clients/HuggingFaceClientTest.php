<?php

use App\Models\ApiKey;
use App\Services\Llm\Clients\HuggingFaceClient;
use App\Services\Llm\Clients\OpenAiClient;
use App\Services\Llm\LlmClientFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

it('reports vendor as huggingface and extends OpenAiClient', function () {
    expect(app(HuggingFaceClient::class))->toBeInstanceOf(OpenAiClient::class);
    expect(app(HuggingFaceClient::class)->vendor())->toBe('huggingface');
});

it('registers with the factory under vendor=huggingface', function () {
    $factory = app(LlmClientFactory::class);

    expect($factory->supports('huggingface'))->toBeTrue();
    expect($factory->clientFor('huggingface'))->toBeInstanceOf(HuggingFaceClient::class);
});

it('uses the configured services.huggingface.base_url', function () {
    config()->set('services.huggingface.base_url', 'https://my-endpoint.endpoints.huggingface.cloud/v1');

    Http::fake([
        '*' => Http::response(
            "data: {\"id\":\"x\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
        ),
    ]);

    $key = ApiKey::factory()->vendor('huggingface')->withKey('hf_test')->create();
    iterator_to_array(
        app(HuggingFaceClient::class)->stream($key, 'meta-llama/Llama-3.1-70B-Instruct', 'Hi', []),
        preserve_keys: false,
    );

    Http::assertSent(fn ($r) => str_starts_with(
        (string) $r->url(),
        'https://my-endpoint.endpoints.huggingface.cloud/v1/chat/completions',
    ));
});

it('does not send the OpenAI-Organization header even if env is set', function () {
    config()->set('services.openai.organization', 'org-not-applicable');
    config()->set('services.huggingface.base_url', 'https://my-endpoint.endpoints.huggingface.cloud/v1');

    Http::fake([
        '*' => Http::response(
            "data: {\"id\":\"x\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
        ),
    ]);

    $key = ApiKey::factory()->vendor('huggingface')->withKey('hf_test')->create();
    iterator_to_array(
        app(HuggingFaceClient::class)->stream($key, 'meta-llama/Llama-3.1-70B-Instruct', 'Hi', []),
        preserve_keys: false,
    );

    Http::assertSent(fn ($r) => ! $r->hasHeader('OpenAI-Organization'));
});
