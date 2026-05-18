<?php

use App\Models\ApiKey;
use App\Services\Llm\Clients\GroqClient;
use App\Services\Llm\Clients\MistralClient;
use App\Services\Llm\Clients\TogetherClient;
use App\Services\Llm\Clients\XaiClient;
use App\Services\Llm\Exceptions\InvalidApiKeyException;
use App\Services\Llm\LlmClientFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

/**
 * Run the OpenAiClient contract across all 4 subclass clients via a
 * Pest dataset. Each row is [vendor, client class, expected base URL,
 * expected request URL after path append].
 *
 * If a vendor changes its base URL we update one cell here. The
 * contract assertions (yield count, payload shape, error mapping)
 * are covered by OpenAiClientTest — these are just the inheritance
 * smoke tests.
 */
dataset('openai_compatible_vendors', [
    'xai' => ['xai', XaiClient::class, 'https://api.x.ai/v1'],
    'mistral' => ['mistral', MistralClient::class, 'https://api.mistral.ai/v1'],
    'groq' => ['groq', GroqClient::class, 'https://api.groq.com/openai/v1'],
    'together' => ['together', TogetherClient::class, 'https://api.together.xyz/v1'],
]);

function sse(string ...$lines): string
{
    $out = '';
    foreach ($lines as $l) {
        $out .= "data: {$l}\n\n";
    }

    return $out . "data: [DONE]\n\n";
}

it('reports the right vendor identifier', function (string $vendor, string $class) {
    expect(app($class)->vendor())->toBe($vendor);
})->with('openai_compatible_vendors');

it('registers itself with LlmClientFactory at boot', function (string $vendor) {
    $factory = app(LlmClientFactory::class);
    expect($factory->supports($vendor))->toBeTrue();
})->with('openai_compatible_vendors');

it('hits the expected vendor base URL for chat completions', function (
    string $vendor,
    string $class,
    string $baseUrl,
) {
    Http::fake([
        '*' => Http::response(sse(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}',
        )),
    ]);

    $key = ApiKey::factory()->vendor($vendor)->withKey('sk-x')->create();

    iterator_to_array(
        app($class)->stream($key, 'some-model', 'Hi', []),
        preserve_keys: false,
    );

    Http::assertSent(fn ($r) => str_starts_with((string) $r->url(), $baseUrl . '/chat/completions'));
})->with('openai_compatible_vendors');

it('does not send the OpenAI-Organization header', function (string $vendor, string $class) {
    // Set the env var that triggers the header on OpenAiClient; the
    // subclasses should override extraHeaders() to drop it.
    config()->set('services.openai.organization', 'org-llmviz');

    Http::fake([
        '*' => Http::response(sse(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}',
        )),
    ]);

    $key = ApiKey::factory()->vendor($vendor)->withKey('sk-x')->create();
    iterator_to_array(
        app($class)->stream($key, 'some-model', 'Hi', []),
        preserve_keys: false,
    );

    Http::assertSent(fn ($r) => ! $r->hasHeader('OpenAI-Organization'));
})->with('openai_compatible_vendors');

it('inherits HTTP error mapping from the base client (401 → InvalidApiKey)', function (
    string $vendor,
    string $class,
) {
    Http::fake([
        '*' => Http::response(['error' => ['message' => 'Bad key']], 401),
    ]);

    $key = ApiKey::factory()->vendor($vendor)->withKey('sk-x')->create();

    expect(fn () => iterator_to_array(
        app($class)->stream($key, 'some-model', 'Hi', []),
        preserve_keys: false,
    ))->toThrow(InvalidApiKeyException::class);
})->with('openai_compatible_vendors');

it('streams text chunks through the inherited eventToChunk parser', function (
    string $vendor,
    string $class,
) {
    Http::fake([
        '*' => Http::response(sse(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
            '{"id":"x","choices":[{"index":0,"delta":{"content":" cluster"},"finish_reason":null}]}',
            '{"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        )),
    ]);

    $key = ApiKey::factory()->vendor($vendor)->withKey('sk-x')->create();
    $chunks = iterator_to_array(
        app($class)->stream($key, 'some-model', 'Hi', []),
        preserve_keys: false,
    );

    expect($chunks[0]->text)->toBe('Hello');
    expect($chunks[1]->text)->toBe(' cluster');
    expect($chunks[2]->isFinal)->toBeTrue();
})->with('openai_compatible_vendors');

it('updates api_keys.last_used_at on success', function (string $vendor, string $class) {
    Http::fake([
        '*' => Http::response(sse(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}',
        )),
    ]);

    $key = ApiKey::factory()->vendor($vendor)->withKey('sk-x')->create();
    expect($key->last_used_at)->toBeNull();

    iterator_to_array(
        app($class)->stream($key, 'some-model', 'Hi', []),
        preserve_keys: false,
    );

    expect($key->fresh()->last_used_at)->not->toBeNull();
})->with('openai_compatible_vendors');
