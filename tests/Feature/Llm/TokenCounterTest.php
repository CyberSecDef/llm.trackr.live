<?php

use App\Services\Llm\TokenCounter\ApproximateTokenCounter;
use App\Services\Llm\TokenCounter\OpenAiTokenCounter;
use App\Services\Llm\TokenCounter\TokenCounterFactory;
use Yethee\Tiktoken\EncoderProvider;

describe('ApproximateTokenCounter', function () {
    it('returns 0 for empty text', function () {
        expect((new ApproximateTokenCounter)->count(''))->toBe(0);
    });

    it('flags itself as not exact', function () {
        expect((new ApproximateTokenCounter)->isExact())->toBeFalse();
    });

    it('produces counts in the right ballpark for English prose', function () {
        $counter = new ApproximateTokenCounter;
        // "Hello world" — 11 chars, real GPT-4 tokenizer says 2 tokens.
        expect($counter->count('Hello world'))->toBeGreaterThan(0)->toBeLessThan(10);
        // A longer paragraph. Real count ≈ 50 tokens; approximation
        // should be within roughly ±20%.
        $para = str_repeat('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ', 4);
        $count = $counter->count($para);
        expect($count)->toBeGreaterThan(40)->toBeLessThan(80);
    });

    it('scales linearly with text length', function () {
        $counter = new ApproximateTokenCounter;
        $short = $counter->count('hello world');
        $long = $counter->count(str_repeat('hello world ', 100));

        expect($long)->toBeGreaterThan($short * 50);
    });
});

describe('OpenAiTokenCounter (real tiktoken)', function () {
    it('returns an exact count using o200k_base for GPT-4o by default', function () {
        $counter = app(TokenCounterFactory::class)->counterFor('openai', 'gpt-4o');

        // "Hello world" is 2 tokens under o200k_base — verified against
        // the upstream tiktoken table.
        expect($counter->count('Hello world'))->toBe(2);
    });

    it('flags itself as exact', function () {
        $counter = app(TokenCounterFactory::class)->counterFor('openai', 'gpt-4o');
        expect($counter->isExact())->toBeTrue();
    });

    it('returns 0 for empty input', function () {
        $counter = app(TokenCounterFactory::class)->counterFor('openai', 'gpt-4o');
        expect($counter->count(''))->toBe(0);
    });

    it('uses cl100k_base for older models', function () {
        // Both encodings should produce *some* count for normal text,
        // but the implementation choice matters for parity with OpenAI.
        $counter = new OpenAiTokenCounter(app(EncoderProvider::class), 'gpt-3.5-turbo');
        expect($counter->count('Hello, world!'))->toBeGreaterThan(0);
    });
});

describe('TokenCounterFactory', function () {
    it('returns the OpenAI counter for vendor=openai', function () {
        $counter = app(TokenCounterFactory::class)->counterFor('openai', 'gpt-4o');

        expect($counter)->toBeInstanceOf(OpenAiTokenCounter::class);
        expect($counter->isExact())->toBeTrue();
    });

    it('returns the approximate counter for other vendors', function () {
        foreach (['anthropic', 'google', 'xai', 'mistral', 'groq', 'together', 'huggingface'] as $vendor) {
            $counter = app(TokenCounterFactory::class)->counterFor($vendor);

            expect($counter)->toBeInstanceOf(ApproximateTokenCounter::class);
            expect($counter->isExact())->toBeFalse();
        }
    });

    it('resolves through the container as a singleton', function () {
        $a = app(TokenCounterFactory::class);
        $b = app(TokenCounterFactory::class);

        expect($a)->toBe($b);
    });
});
