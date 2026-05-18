<?php

use App\Models\ApiKey;
use App\Services\Llm\Clients\MetaViaTogetherClient;
use App\Services\Llm\Clients\TogetherClient;
use App\Services\Llm\LlmClientFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

it('reports vendor as meta and extends TogetherClient', function () {
    expect(app(MetaViaTogetherClient::class))->toBeInstanceOf(TogetherClient::class);
    expect(app(MetaViaTogetherClient::class)->vendor())->toBe('meta');
});

it('hits the Together base URL just like its parent class', function () {
    Http::fake([
        '*' => Http::response(
            "data: {\"id\":\"x\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
        ),
    ]);

    $key = ApiKey::factory()->vendor('meta')->withKey('together-key-passed-through')->create();
    iterator_to_array(
        app(MetaViaTogetherClient::class)->stream(
            $key,
            'meta-llama/Llama-3.1-70B-Instruct-Turbo',
            'Hi',
            [],
        ),
        preserve_keys: false,
    );

    Http::assertSent(fn ($r) => str_starts_with(
        (string) $r->url(),
        'https://api.together.xyz/v1/chat/completions',
    ));
});

it('registers with the factory under vendor=meta', function () {
    $factory = app(LlmClientFactory::class);

    expect($factory->supports('meta'))->toBeTrue();
    expect($factory->clientFor('meta'))->toBeInstanceOf(MetaViaTogetherClient::class);
});

it('passes through the supplied ApiKey as Bearer auth', function () {
    Http::fake([
        '*' => Http::response(
            "data: {\"id\":\"x\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
        ),
    ]);

    $key = ApiKey::factory()->vendor('meta')->withKey('sk-together-pass')->create();
    iterator_to_array(
        app(MetaViaTogetherClient::class)->stream(
            $key,
            'meta-llama/Llama-3.1-70B-Instruct-Turbo',
            'Hi',
            [],
        ),
        preserve_keys: false,
    );

    Http::assertSent(fn ($r) => $r->hasHeader('Authorization', 'Bearer sk-together-pass'));
});
