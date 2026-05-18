<?php

use App\Enums\RunStatus;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('persists the spec-mandated run columns', function () {
    $run = Run::factory()->create([
        'prompt' => 'What is 2+2?',
        'parameters' => ['temperature' => 0.5, 'top_p' => 0.9],
        'token_log' => [['token' => '4', 't_ms' => 12]],
        'output_text' => '4',
        'input_tokens' => 8,
        'output_tokens' => 1,
        'duration_ms' => 350,
        'tokens_per_second' => 2.85,
        'estimated_cost' => 0.0001,
    ]);

    $fresh = $run->fresh();
    expect($fresh->prompt)->toBe('What is 2+2?');
    expect($fresh->parameters)->toBe(['temperature' => 0.5, 'top_p' => 0.9]);
    expect($fresh->token_log)->toBe([['token' => '4', 't_ms' => 12]]);
    expect($fresh->output_text)->toBe('4');
    expect($fresh->input_tokens)->toBe(8);
    expect($fresh->output_tokens)->toBe(1);
});

it('casts status to the RunStatus enum', function () {
    expect(Run::factory()->create()->status)->toBe(RunStatus::Pending);
    expect(Run::factory()->streaming()->create()->status)->toBe(RunStatus::Streaming);
    expect(Run::factory()->complete()->create()->status)->toBe(RunStatus::Complete);
    expect(Run::factory()->errored()->create()->status)->toBe(RunStatus::Error);
});

it('reports isTerminal() correctly', function () {
    expect(Run::factory()->create()->isTerminal())->toBeFalse();
    expect(Run::factory()->streaming()->create()->isTerminal())->toBeFalse();
    expect(Run::factory()->complete()->create()->isTerminal())->toBeTrue();
    expect(Run::factory()->errored()->create()->isTerminal())->toBeTrue();
});

it('casts JSON columns to arrays', function () {
    $run = Run::factory()->create([
        'parameters' => ['x' => 1],
        'token_log' => [['t' => 'a']],
        'conversation_history' => [['role' => 'user', 'content' => 'hi']],
    ]);

    $fresh = $run->fresh();
    expect($fresh->parameters)->toBeArray()->toBe(['x' => 1]);
    expect($fresh->token_log)->toBeArray();
    expect($fresh->conversation_history)->toBeArray();
});

it('enforces unique (thread_id, sequence_in_thread)', function () {
    $thread = Thread::factory()->create();
    Run::factory()->for($thread)->create(['sequence_in_thread' => 1]);

    expect(fn () => Run::factory()->for($thread)->create(['sequence_in_thread' => 1]))
        ->toThrow(UniqueConstraintViolationException::class);
});

it('allows the same sequence number across different threads', function () {
    Run::factory()->create(['sequence_in_thread' => 1]);
    Run::factory()->create(['sequence_in_thread' => 1]);

    expect(Run::count())->toBe(2);
});

it('refuses to delete a model that has runs (ON DELETE RESTRICT)', function () {
    $model = LlmModel::factory()->create();
    Run::factory()->create(['model_id' => $model->id]);

    expect(fn () => $model->delete())->toThrow(QueryException::class);
});

it('cascades runs when the owning user is deleted', function () {
    $user = User::factory()->create();
    Run::factory()->for($user)->count(2)->create([
        'thread_id' => fn () => Thread::factory()->for($user)->create()->id,
        'sequence_in_thread' => fn () => fake()->unique()->numberBetween(1, 1000),
    ]);
    expect(Run::count())->toBe(2);

    $user->delete();

    expect(Run::count())->toBe(0);
});

it('exposes the User -> runs HasMany relation', function () {
    $user = User::factory()->create();
    Run::factory()->for($user)->count(2)->create([
        'thread_id' => fn () => Thread::factory()->for($user)->create()->id,
        'sequence_in_thread' => fn () => fake()->unique()->numberBetween(1, 1000),
    ]);
    Run::factory()->count(3)->create(['sequence_in_thread' => fn () => fake()->unique()->numberBetween(1, 1000)]);

    expect($user->runs()->count())->toBe(2);
});

it('exposes the LlmModel -> runs HasMany relation', function () {
    $model = LlmModel::factory()->create();
    // Explicit relation name — Run::model() vs the auto-derived llmModel().
    Run::factory()->for($model, 'model')->count(2)->create([
        'sequence_in_thread' => fn () => fake()->unique()->numberBetween(1, 1000),
    ]);

    expect($model->runs()->count())->toBe(2);
});

it('exposes Run -> thread / user / model BelongsTo relations', function () {
    $run = Run::factory()->create();

    expect($run->thread)->toBeInstanceOf(Thread::class);
    expect($run->user)->toBeInstanceOf(User::class);
    expect($run->model)->toBeInstanceOf(LlmModel::class);
});

it('preserves the privacy-redacted shape (null prompt, hash kept)', function () {
    $run = Run::factory()->privacyRedacted()->create([
        'prompt_hash' => str_repeat('a', 64),
    ]);

    $fresh = $run->fresh();
    expect($fresh->prompt)->toBeNull();
    expect($fresh->conversation_history)->toBeNull();
    expect($fresh->prompt_hash)->toBe(str_repeat('a', 64));
});

it('requires prompt_hash to be non-null even when prompt is redacted', function () {
    expect(fn () => Run::factory()->create([
        'prompt_hash' => null,
    ]))->toThrow(QueryException::class);
});

it('defaults status to pending on a new factory-built run', function () {
    expect(Run::factory()->create()->status)->toBe(RunStatus::Pending);
});
