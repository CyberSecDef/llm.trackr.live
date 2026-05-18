<?php

use App\Models\ApiKey;
use App\Services\Llm\Clients\OpenAiClient;
use App\Services\Llm\Exceptions\InvalidApiKeyException;
use App\Services\Llm\Exceptions\LlmClientException;
use App\Services\Llm\Exceptions\VendorRateLimitedException;
use App\Services\Llm\LlmClientFactory;
use App\Services\Llm\LlmTokenChunk;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

function openaiKey(string $plaintext = 'sk-test-1234567890abcdef'): ApiKey
{
    return ApiKey::factory()->vendor('openai')->withKey($plaintext)->create();
}

/** Inline raw SSE bodies — readable, no fixture files yet. */
function sseStream(string ...$dataLines): string
{
    $out = '';
    foreach ($dataLines as $line) {
        $out .= "data: {$line}\n\n";
    }

    return $out . "data: [DONE]\n\n";
}

it('streams text chunks parsed from the OpenAI SSE response', function () {
    Http::fake([
        '*/chat/completions' => Http::response(sseStream(
            '{"id":"x","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
            '{"id":"x","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
            '{"id":"x","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}',
            '{"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
            '{"id":"x","choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}',
        )),
    ]);

    $client = app(OpenAiClient::class);
    $chunks = iterator_to_array($client->stream(
        openaiKey(),
        'gpt-4o',
        'Hi',
        ['temperature' => 0.7],
    ), preserve_keys: false);

    expect($chunks)->toHaveCount(4);
    expect($chunks[0]->text)->toBe('Hello');
    expect($chunks[1]->text)->toBe(' world');
    expect($chunks[2]->isFinal)->toBeTrue();
    expect($chunks[3]->usage)->toBe([
        'input_tokens' => 5,
        'output_tokens' => 2,
    ]);
});

it('passes through top-k logprobs when the caller asks for them', function () {
    Http::fake([
        '*/chat/completions' => Http::response(sseStream(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"Hi"},"logprobs":{"content":[{"token":"Hi","logprob":-0.5,"top_logprobs":[{"token":"Hi","logprob":-0.5},{"token":"Hello","logprob":-1.2}]}]}}]}',
            '{"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        )),
    ]);

    $client = app(OpenAiClient::class);
    $chunks = iterator_to_array($client->stream(
        openaiKey(),
        'gpt-4o',
        'Hi',
        ['logprobs' => true, 'top_logprobs' => 2],
    ), preserve_keys: false);

    expect($chunks[0]->logprobs)->not->toBeNull();
    expect($chunks[0]->logprobs[0]['token'])->toBe('Hi');
});

it('includes the request payload params the SPEC mandates', function () {
    Http::fake([
        '*/chat/completions' => Http::response(sseStream(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"a"},"finish_reason":null}]}',
        )),
    ]);

    $client = app(OpenAiClient::class);
    iterator_to_array($client->stream(
        openaiKey(),
        'gpt-4o',
        'Hi',
        ['temperature' => 0.5, 'top_p' => 0.9, 'max_tokens' => 100, 'seed' => 42],
        history: [['role' => 'system', 'content' => 'be terse']],
    ), preserve_keys: false);

    Http::assertSent(function ($request) {
        $body = $request->data();

        return $body['model'] === 'gpt-4o'
            && $body['stream'] === true
            && $body['stream_options']['include_usage'] === true
            && $body['temperature'] === 0.5
            && $body['top_p'] === 0.9
            && $body['max_tokens'] === 100
            && $body['seed'] === 42
            && $body['messages'][0]['role'] === 'system'
            && $body['messages'][0]['content'] === 'be terse'
            && $body['messages'][1]['role'] === 'user'
            && $body['messages'][1]['content'] === 'Hi';
    });
});

it('drops top_k silently since OpenAI does not accept it', function () {
    Http::fake([
        '*/chat/completions' => Http::response(sseStream(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"a"},"finish_reason":null}]}',
        )),
    ]);

    iterator_to_array(app(OpenAiClient::class)->stream(
        openaiKey(),
        'gpt-4o',
        'Hi',
        ['top_k' => 50],
    ), preserve_keys: false);

    Http::assertSent(fn ($request) => ! array_key_exists('top_k', $request->data()));
});

it('returns a complete LlmCompletion for non-streaming calls', function () {
    Http::fake([
        '*/chat/completions' => Http::response([
            'id' => 'chatcmpl-1',
            'object' => 'chat.completion',
            'choices' => [
                ['index' => 0, 'message' => ['role' => 'assistant', 'content' => 'Hello!'], 'finish_reason' => 'stop'],
            ],
            'usage' => ['prompt_tokens' => 5, 'completion_tokens' => 2, 'total_tokens' => 7],
        ]),
    ]);

    $completion = app(OpenAiClient::class)->complete(
        openaiKey(),
        'gpt-4o',
        'Hi',
        [],
    );

    expect($completion->text)->toBe('Hello!');
    expect($completion->usage->inputTokens)->toBe(5);
    expect($completion->usage->outputTokens)->toBe(2);
    expect($completion->rawResponse['id'])->toBe('chatcmpl-1');
});

it('throws InvalidApiKeyException on 401', function () {
    Http::fake([
        '*/chat/completions' => Http::response([
            'error' => ['message' => 'Incorrect API key'],
        ], 401),
    ]);

    expect(fn () => iterator_to_array(
        app(OpenAiClient::class)->stream(openaiKey(), 'gpt-4o', 'Hi', []),
        preserve_keys: false,
    ))->toThrow(InvalidApiKeyException::class);
});

it('throws VendorRateLimitedException on 429', function () {
    Http::fake([
        '*/chat/completions' => Http::response([
            'error' => ['message' => 'Rate limit'],
        ], 429, ['Retry-After' => '60']),
    ]);

    try {
        iterator_to_array(
            app(OpenAiClient::class)->stream(openaiKey(), 'gpt-4o', 'Hi', []),
            preserve_keys: false,
        );
        expect()->fail('Expected VendorRateLimitedException');
    } catch (VendorRateLimitedException $e) {
        expect($e->retryAfterSeconds)->toBe(60);
    }
});

it('throws generic LlmClientException on 500', function () {
    Http::fake([
        '*/chat/completions' => Http::response([
            'error' => ['message' => 'oops'],
        ], 500),
    ]);

    expect(fn () => iterator_to_array(
        app(OpenAiClient::class)->stream(openaiKey(), 'gpt-4o', 'Hi', []),
        preserve_keys: false,
    ))->toThrow(LlmClientException::class);
});

it('updates api_keys.last_used_at on a successful call', function () {
    Http::fake([
        '*/chat/completions' => Http::response(sseStream(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"a"},"finish_reason":"stop"}]}',
        )),
    ]);

    $key = openaiKey();
    expect($key->last_used_at)->toBeNull();

    iterator_to_array(
        app(OpenAiClient::class)->stream($key, 'gpt-4o', 'Hi', []),
        preserve_keys: false,
    );

    expect($key->fresh()->last_used_at)->not->toBeNull();
});

it('registers itself with the LlmClientFactory at boot', function () {
    $factory = app(LlmClientFactory::class);

    expect($factory->supports('openai'))->toBeTrue();
    expect($factory->clientFor('openai'))->toBeInstanceOf(OpenAiClient::class);
});

it('reports vendor() as openai', function () {
    expect(app(OpenAiClient::class)->vendor())->toBe('openai');
});

it('yields each chunk as an LlmTokenChunk value object', function () {
    Http::fake([
        '*/chat/completions' => Http::response(sseStream(
            '{"id":"x","choices":[{"index":0,"delta":{"content":"a"},"finish_reason":null}]}',
            '{"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        )),
    ]);

    $chunks = iterator_to_array(
        app(OpenAiClient::class)->stream(openaiKey(), 'gpt-4o', 'Hi', []),
        preserve_keys: false,
    );

    foreach ($chunks as $chunk) {
        expect($chunk)->toBeInstanceOf(LlmTokenChunk::class);
    }
    expect($chunks[0]->index)->toBe(0);
    expect($chunks[1]->index)->toBe(1);
});
