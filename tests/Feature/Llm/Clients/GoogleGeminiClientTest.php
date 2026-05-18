<?php

use App\Models\ApiKey;
use App\Services\Llm\Clients\GoogleGeminiClient;
use App\Services\Llm\Exceptions\InvalidApiKeyException;
use App\Services\Llm\LlmClientFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

function geminiKey(string $plaintext = 'AIza-test-key'): ApiKey
{
    return ApiKey::factory()->vendor('google')->withKey($plaintext)->create();
}

function geminiSse(string ...$dataLines): string
{
    $out = '';
    foreach ($dataLines as $line) {
        $out .= "data: {$line}\n\n";
    }

    return $out;
}

it('streams text from Gemini candidates[0].content.parts[*].text', function () {
    Http::fake([
        '*generativelanguage.googleapis.com/*' => Http::response(geminiSse(
            '{"candidates":[{"content":{"role":"model","parts":[{"text":"Hello"}]}}]}',
            '{"candidates":[{"content":{"role":"model","parts":[{"text":" world"}]}}]}',
            '{"candidates":[{"content":{"role":"model","parts":[{"text":""}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}',
        )),
    ]);

    $chunks = iterator_to_array(app(GoogleGeminiClient::class)->stream(
        geminiKey(),
        'gemini-1.5-pro',
        'Hi',
        [],
    ), preserve_keys: false);

    expect($chunks[0]->text)->toBe('Hello');
    expect($chunks[1]->text)->toBe(' world');
    expect($chunks[2]->isFinal)->toBeTrue();
    expect($chunks[2]->usage)->toBe([
        'input_tokens' => 3,
        'output_tokens' => 2,
    ]);
});

it('puts the API key in the URL query string, not a header', function () {
    Http::fake([
        '*generativelanguage.googleapis.com/*' => Http::response(geminiSse(
            '{"candidates":[{"content":{"parts":[{"text":"hi"}]},"finishReason":"STOP"}]}',
        )),
    ]);

    iterator_to_array(app(GoogleGeminiClient::class)->stream(
        geminiKey('AIza-secret'),
        'gemini-1.5-pro',
        'Hi',
        [],
    ), preserve_keys: false);

    Http::assertSent(function ($r) {
        // Key in URL, no Authorization header.
        return str_contains((string) $r->url(), 'key=AIza-secret')
            && ! $r->hasHeader('Authorization');
    });
});

it('hits the streamGenerateContent endpoint with alt=sse', function () {
    Http::fake([
        '*generativelanguage.googleapis.com/*' => Http::response(geminiSse(
            '{"candidates":[{"content":{"parts":[{"text":"hi"}]},"finishReason":"STOP"}]}',
        )),
    ]);

    iterator_to_array(app(GoogleGeminiClient::class)->stream(
        geminiKey(),
        'gemini-1.5-pro',
        'Hi',
        [],
    ), preserve_keys: false);

    Http::assertSent(fn ($r) => str_contains((string) $r->url(), ':streamGenerateContent')
        && str_contains((string) $r->url(), 'alt=sse'));
});

it('maps assistant role to model and extracts system into systemInstruction', function () {
    Http::fake([
        '*generativelanguage.googleapis.com/*' => Http::response(geminiSse(
            '{"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}',
        )),
    ]);

    iterator_to_array(app(GoogleGeminiClient::class)->stream(
        geminiKey(),
        'gemini-1.5-pro',
        'next user',
        ['temperature' => 0.5, 'top_p' => 0.9, 'top_k' => 40, 'max_tokens' => 200, 'seed' => 7],
        history: [
            ['role' => 'system', 'content' => 'be helpful'],
            ['role' => 'user', 'content' => 'q1'],
            ['role' => 'assistant', 'content' => 'a1'],
        ],
    ), preserve_keys: false);

    Http::assertSent(function ($r) {
        $body = $r->data();

        return $body['systemInstruction']['parts'][0]['text'] === 'be helpful'
            && count($body['contents']) === 3
            && $body['contents'][0] === ['role' => 'user', 'parts' => [['text' => 'q1']]]
            && $body['contents'][1] === ['role' => 'model', 'parts' => [['text' => 'a1']]]
            && $body['contents'][2] === ['role' => 'user', 'parts' => [['text' => 'next user']]]
            && $body['generationConfig'] === [
                'temperature' => 0.5,
                'topP' => 0.9,
                'topK' => 40,
                'maxOutputTokens' => 200,
                'seed' => 7,
            ];
    });
});

it('returns an LlmCompletion from non-streaming generateContent', function () {
    Http::fake([
        '*generativelanguage.googleapis.com/*' => Http::response([
            'candidates' => [
                ['content' => ['parts' => [['text' => 'Hello world']]]],
            ],
            'usageMetadata' => ['promptTokenCount' => 3, 'candidatesTokenCount' => 2],
        ]),
    ]);

    $completion = app(GoogleGeminiClient::class)->complete(
        geminiKey(),
        'gemini-1.5-pro',
        'Hi',
        [],
    );

    expect($completion->text)->toBe('Hello world');
    expect($completion->usage->inputTokens)->toBe(3);
    expect($completion->usage->outputTokens)->toBe(2);
});

it('maps 403 to InvalidApiKeyException (Gemini returns 403 for bad keys)', function () {
    Http::fake([
        '*generativelanguage.googleapis.com/*' => Http::response(['error' => ['message' => 'bad']], 403),
    ]);

    expect(fn () => iterator_to_array(
        app(GoogleGeminiClient::class)->stream(geminiKey(), 'gemini-1.5-pro', 'Hi', []),
        preserve_keys: false,
    ))->toThrow(InvalidApiKeyException::class);
});

it('registers with LlmClientFactory under vendor=google', function () {
    $factory = app(LlmClientFactory::class);

    expect($factory->supports('google'))->toBeTrue();
    expect($factory->clientFor('google'))->toBeInstanceOf(GoogleGeminiClient::class);
});
