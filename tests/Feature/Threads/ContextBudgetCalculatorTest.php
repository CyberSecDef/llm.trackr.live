<?php

use App\Models\LlmModel;
use App\Services\Threads\ContextBudgetCalculator;

beforeEach(function () {
    $this->calculator = app(ContextBudgetCalculator::class);
});

it('returns fits=true when the conversation fits within context_length', function () {
    $model = LlmModel::factory()->make(['context_length' => 100000, 'vendor' => 'anthropic']);

    $result = $this->calculator->check(
        $model,
        history: [
            ['role' => 'system', 'content' => 'short system'],
            ['role' => 'user', 'content' => 'short turn'],
            ['role' => 'assistant', 'content' => 'short reply'],
        ],
        newPrompt: 'short new prompt',
    );

    expect($result->fits)->toBeTrue();
    expect($result->overBy)->toBe(0);
    expect($result->budget)->toBe(100000);
    expect($result->totalTokens)->toBeGreaterThan(0);
});

it('returns fits=false when total exceeds context_length', function () {
    $model = LlmModel::factory()->make(['context_length' => 10, 'vendor' => 'anthropic']);

    $longText = str_repeat('word ', 200); // ~250 approximate tokens

    $result = $this->calculator->check(
        $model,
        history: [['role' => 'user', 'content' => $longText]],
        newPrompt: 'short',
    );

    expect($result->fits)->toBeFalse();
    expect($result->overBy)->toBeGreaterThan(0);
    expect($result->totalTokens)->toBe($result->budget + $result->overBy);
});

it('reserves space for the response when max_tokens is supplied', function () {
    $model = LlmModel::factory()->make(['context_length' => 100, 'vendor' => 'anthropic']);

    // 'hi' ≈ 1 token, 'hello' ≈ 2 tokens (approximate counter, chars/4).
    // Without reserve: total ≈ 3, fits in 100. With 99-token reserve:
    // 3 + 99 = 102 > 100, doesn't fit.
    $shortHistory = [['role' => 'user', 'content' => 'hi']];

    $without = $this->calculator->check($model, $shortHistory, 'hello');
    $with = $this->calculator->check($model, $shortHistory, 'hello', reservedForResponse: 99);

    expect($without->fits)->toBeTrue();
    expect($with->fits)->toBeFalse();
    expect($with->totalTokens - $without->totalTokens)->toBe(99);
});

it('treats a model with null/zero context_length as unlimited', function () {
    $nullModel = LlmModel::factory()->make(['context_length' => null, 'vendor' => 'anthropic']);
    $zeroModel = LlmModel::factory()->make(['context_length' => 0, 'vendor' => 'anthropic']);

    foreach ([$nullModel, $zeroModel] as $m) {
        $result = $this->calculator->check(
            $m,
            history: [['role' => 'user', 'content' => str_repeat('long ', 10000)]],
            newPrompt: 'whatever',
        );
        expect($result->fits)->toBeTrue();
        expect($result->budget)->toBe(0);
    }
});

it('uses tiktoken for OpenAI models (exact counts)', function () {
    $model = LlmModel::factory()->make([
        'context_length' => 100000,
        'vendor' => 'openai',
        'name' => 'gpt-4o',
    ]);

    // "Hello world" is 2 tokens under o200k_base — verified against the
    // tiktoken upstream tables. So a single-turn history of one message
    // + a one-message new prompt of the same should be 4 tokens total.
    $result = $this->calculator->check(
        $model,
        history: [['role' => 'user', 'content' => 'Hello world']],
        newPrompt: 'Hello world',
    );

    expect($result->totalTokens)->toBe(4);
});

it('uses the approximate counter for non-OpenAI vendors', function () {
    $modelExact = LlmModel::factory()->make([
        'context_length' => 100000,
        'vendor' => 'openai',
        'name' => 'gpt-4o',
    ]);
    $modelApprox = LlmModel::factory()->make([
        'context_length' => 100000,
        'vendor' => 'anthropic',
        'name' => 'claude-3-5-sonnet',
    ]);

    $text = 'Hello world';

    $exact = $this->calculator->check($modelExact, [], $text);
    $approx = $this->calculator->check($modelApprox, [], $text);

    // tiktoken says 2; approximate says ceil(11/4) = 3. Different
    // numbers prove the factory routes per vendor.
    expect($exact->totalTokens)->not->toBe($approx->totalTokens);
});

it('boundary: exactly equal to budget is allowed', function () {
    $model = LlmModel::factory()->make(['context_length' => 5, 'vendor' => 'anthropic']);

    // 'a' = 1 token under approximate counter (ceil(1/4)=1)
    $result = $this->calculator->check($model, [], 'aaaaaaaaaaaaaaaaaaaa'); // 20 chars / 4 = 5 tokens

    expect($result->totalTokens)->toBe(5);
    expect($result->fits)->toBeTrue();
});

it('boundary: 1 over budget rejects', function () {
    $model = LlmModel::factory()->make(['context_length' => 5, 'vendor' => 'anthropic']);

    $result = $this->calculator->check(
        $model,
        history: [],
        newPrompt: 'aaaaaaaaaaaaaaaaaaaaa', // 21 chars → 6 tokens
    );

    expect($result->fits)->toBeFalse();
    expect($result->overBy)->toBe(1);
});

it('handles empty history + empty prompt', function () {
    $model = LlmModel::factory()->make(['context_length' => 100, 'vendor' => 'anthropic']);

    $result = $this->calculator->check($model, [], '');

    expect($result->fits)->toBeTrue();
    expect($result->totalTokens)->toBe(0);
});

it('exposes the budget + total + overBy fields on the result object', function () {
    $model = LlmModel::factory()->make(['context_length' => 50, 'vendor' => 'anthropic']);

    $result = $this->calculator->check(
        $model,
        history: [],
        newPrompt: str_repeat('a', 400), // 100 tokens
    );

    expect($result->fits)->toBeFalse();
    expect($result->budget)->toBe(50);
    expect($result->totalTokens)->toBe(100);
    expect($result->overBy)->toBe(50);
});
