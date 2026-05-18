<?php

use App\Models\ApiKey;
use App\Services\Llm\Clients\AnthropicClient;
use App\Services\Llm\Exceptions\InvalidApiKeyException;
use App\Services\Llm\Exceptions\VendorRateLimitedException;
use App\Services\Llm\LlmClientFactory;
use App\Services\Llm\LlmTokenChunk;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

function anthropicKey(string $plaintext = 'sk-ant-test'): ApiKey
{
    return ApiKey::factory()->vendor('anthropic')->withKey($plaintext)->create();
}

/** Build a multi-event Anthropic SSE body. */
function anthropicStream(string ...$dataLines): string
{
    $out = '';
    foreach ($dataLines as $line) {
        $out .= "data: {$line}\n\n";
    }

    return $out;
}

it('parses Anthropic content_block_delta events into text chunks', function () {
    Http::fake([
        '*/v1/messages' => Http::response(anthropicStream(
            '{"type":"message_start","message":{"id":"m","usage":{"input_tokens":10,"output_tokens":0}}}',
            '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
            '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
            '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
            '{"type":"content_block_stop","index":0}',
            '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
            '{"type":"message_stop"}',
        )),
    ]);

    $chunks = iterator_to_array(
        app(AnthropicClient::class)->stream(
            anthropicKey(),
            'claude-3-5-sonnet',
            'Hi',
            [],
        ),
        preserve_keys: false,
    );

    expect($chunks[0]->text)->toBe('Hello');
    expect($chunks[1]->text)->toBe(' world');
    expect($chunks[2]->text)->toBe('');                  // final marker chunk
    expect($chunks[2]->isFinal)->toBeTrue();
    expect($chunks[2]->usage)->toBe([
        'input_tokens' => 10,
        'output_tokens' => 2,
    ]);
});

it('extracts system messages from history into the top-level system field', function () {
    Http::fake([
        '*/v1/messages' => Http::response(anthropicStream(
            '{"type":"message_start","message":{"id":"m","usage":{"input_tokens":1,"output_tokens":0}}}',
            '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
            '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}',
        )),
    ]);

    iterator_to_array(app(AnthropicClient::class)->stream(
        anthropicKey(),
        'claude-3-5-sonnet',
        'Hi',
        ['temperature' => 0.4],
        history: [
            ['role' => 'system', 'content' => 'be terse'],
            ['role' => 'user', 'content' => 'previous question'],
            ['role' => 'assistant', 'content' => 'previous answer'],
        ],
    ), preserve_keys: false);

    Http::assertSent(function ($request) {
        $body = $request->data();

        return $body['system'] === 'be terse'
            && $body['model'] === 'claude-3-5-sonnet'
            && $body['stream'] === true
            && $body['temperature'] === 0.4
            && $body['max_tokens'] === 4096                       // default
            && count($body['messages']) === 3                     // 2 history + 1 prompt
            && $body['messages'][0]['role'] === 'user'            // system not in messages
            && $body['messages'][1]['role'] === 'assistant'
            && $body['messages'][2] === ['role' => 'user', 'content' => 'Hi'];
    });
});

it('sends max_tokens from params when provided', function () {
    Http::fake([
        '*/v1/messages' => Http::response(anthropicStream(
            '{"type":"message_start","message":{"id":"m","usage":{"input_tokens":1,"output_tokens":0}}}',
            '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}',
            '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}',
        )),
    ]);

    iterator_to_array(app(AnthropicClient::class)->stream(
        anthropicKey(),
        'claude-3-5-sonnet',
        'Hi',
        ['max_tokens' => 50],
    ), preserve_keys: false);

    Http::assertSent(fn ($r) => $r->data()['max_tokens'] === 50);
});

it('sends the x-api-key and anthropic-version headers', function () {
    Http::fake([
        '*/v1/messages' => Http::response(anthropicStream(
            '{"type":"message_start","message":{"id":"m","usage":{"input_tokens":1,"output_tokens":0}}}',
            '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}',
        )),
    ]);

    iterator_to_array(app(AnthropicClient::class)->stream(
        anthropicKey('sk-ant-abc'),
        'claude-3-5-sonnet',
        'Hi',
        [],
    ), preserve_keys: false);

    Http::assertSent(function ($r) {
        return $r->hasHeader('x-api-key', 'sk-ant-abc')
            && $r->hasHeader('anthropic-version', '2023-06-01');
    });
});

it('returns an LlmCompletion from complete() concatenating text blocks', function () {
    Http::fake([
        '*/v1/messages' => Http::response([
            'id' => 'msg_1',
            'content' => [
                ['type' => 'text', 'text' => 'Hello'],
                ['type' => 'text', 'text' => ' world'],
            ],
            'usage' => ['input_tokens' => 5, 'output_tokens' => 2],
        ]),
    ]);

    $completion = app(AnthropicClient::class)->complete(
        anthropicKey(),
        'claude-3-5-sonnet',
        'Hi',
        [],
    );

    expect($completion->text)->toBe('Hello world');
    expect($completion->usage->inputTokens)->toBe(5);
    expect($completion->usage->outputTokens)->toBe(2);
});

it('maps 401 to InvalidApiKeyException', function () {
    Http::fake([
        '*/v1/messages' => Http::response(['error' => ['message' => 'bad']], 401),
    ]);

    expect(fn () => iterator_to_array(
        app(AnthropicClient::class)->stream(anthropicKey(), 'claude-3-5-sonnet', 'Hi', []),
        preserve_keys: false,
    ))->toThrow(InvalidApiKeyException::class);
});

it('maps 429 to VendorRateLimitedException with Retry-After', function () {
    Http::fake([
        '*/v1/messages' => Http::response(['error' => ['message' => 'slow down']], 429, ['Retry-After' => '30']),
    ]);

    try {
        iterator_to_array(
            app(AnthropicClient::class)->stream(anthropicKey(), 'claude-3-5-sonnet', 'Hi', []),
            preserve_keys: false,
        );
        expect()->fail('Expected exception');
    } catch (VendorRateLimitedException $e) {
        expect($e->retryAfterSeconds)->toBe(30);
    }
});

it('registers with LlmClientFactory under vendor=anthropic', function () {
    $factory = app(LlmClientFactory::class);

    expect($factory->supports('anthropic'))->toBeTrue();
    expect($factory->clientFor('anthropic'))->toBeInstanceOf(AnthropicClient::class);
});

it('yields LlmTokenChunk value objects', function () {
    Http::fake([
        '*/v1/messages' => Http::response(anthropicStream(
            '{"type":"message_start","message":{"id":"m","usage":{"input_tokens":1,"output_tokens":0}}}',
            '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}',
            '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}',
        )),
    ]);

    $chunks = iterator_to_array(
        app(AnthropicClient::class)->stream(anthropicKey(), 'claude-3-5-sonnet', 'Hi', []),
        preserve_keys: false,
    );

    foreach ($chunks as $chunk) {
        expect($chunk)->toBeInstanceOf(LlmTokenChunk::class);
    }
});
