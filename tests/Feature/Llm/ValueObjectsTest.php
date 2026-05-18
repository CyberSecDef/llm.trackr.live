<?php

use App\Services\Llm\LlmCompletion;
use App\Services\Llm\LlmTokenChunk;
use App\Services\Llm\LlmUsage;

it('builds an LlmTokenChunk with sensible defaults', function () {
    $chunk = new LlmTokenChunk(text: 'hello');

    expect($chunk->text)->toBe('hello');
    expect($chunk->index)->toBeNull();
    expect($chunk->logprobs)->toBeNull();
    expect($chunk->isFinal)->toBeFalse();
    expect($chunk->usage)->toBeNull();
});

it('preserves logprobs and final marker when supplied', function () {
    $chunk = new LlmTokenChunk(
        text: 'world',
        index: 3,
        logprobs: [
            ['token' => 'world', 'logprob' => -0.42],
            ['token' => 'World', 'logprob' => -2.10],
        ],
        isFinal: true,
        usage: ['input_tokens' => 5, 'output_tokens' => 4],
    );

    expect($chunk->index)->toBe(3);
    expect($chunk->logprobs)->toHaveCount(2);
    expect($chunk->isFinal)->toBeTrue();
    expect($chunk->usage['output_tokens'])->toBe(4);
});

it('computes total tokens from LlmUsage', function () {
    $usage = new LlmUsage(inputTokens: 10, outputTokens: 25);

    expect($usage->totalTokens())->toBe(35);
});

it('exposes optional estimated cost on LlmUsage', function () {
    $usage = new LlmUsage(inputTokens: 100, outputTokens: 50, estimatedCost: 0.0015);

    expect($usage->estimatedCost)->toBe(0.0015);
});

it('preserves the raw response inside LlmCompletion', function () {
    $completion = new LlmCompletion(
        text: 'done',
        usage: new LlmUsage(inputTokens: 1, outputTokens: 1),
        rawResponse: ['id' => 'chatcmpl-xyz', 'object' => 'chat.completion'],
    );

    expect($completion->rawResponse)->toBe(['id' => 'chatcmpl-xyz', 'object' => 'chat.completion']);
});
