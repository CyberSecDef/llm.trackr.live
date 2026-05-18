<?php

use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('persists the spec-mandated thread columns', function () {
    $user = User::factory()->create();
    $model = LlmModel::factory()->create();

    $thread = Thread::factory()->for($user)->create([
        'title' => 'My research thread',
        'system_prompt' => 'be terse',
        'default_model_id' => $model->id,
        'default_parameters' => ['temperature' => 0.5],
        'tags' => ['research', 'phase-1'],
    ]);

    $fresh = $thread->fresh();
    expect($fresh->title)->toBe('My research thread');
    expect($fresh->system_prompt)->toBe('be terse');
    expect($fresh->default_model_id)->toBe($model->id);
    expect($fresh->default_parameters)->toBe(['temperature' => 0.5]);
    expect($fresh->tags)->toBe(['research', 'phase-1']);
    expect($fresh->archived)->toBeFalse();
});

it('casts default_parameters and tags as arrays', function () {
    $thread = Thread::factory()->create([
        'default_parameters' => ['temperature' => 0.5, 'top_p' => 0.9],
        'tags' => ['a', 'b', 'c'],
    ]);

    expect($thread->fresh()->default_parameters)->toBeArray();
    expect($thread->fresh()->tags)->toBeArray();
});

it('casts archived as boolean and last_activity_at as datetime', function () {
    $thread = Thread::factory()->archived()->create([
        'last_activity_at' => now(),
    ]);

    expect($thread->fresh()->archived)->toBeTrue();
    expect($thread->fresh()->last_activity_at)->toBeInstanceOf(Carbon\Carbon::class);
});

it('cascades to runs on thread delete', function () {
    $thread = Thread::factory()->create();
    Run::factory()->for($thread)->count(3)->create(['sequence_in_thread' => fn () => fake()->unique()->numberBetween(1, 1000)]);
    expect(Run::count())->toBe(3);

    $thread->delete();

    expect(Run::count())->toBe(0);
});

it('cascades to threads on user delete', function () {
    $user = User::factory()->create();
    Thread::factory()->for($user)->count(2)->create();
    expect(Thread::count())->toBe(2);

    $user->delete();

    expect(Thread::count())->toBe(0);
});

it('enforces unique share_token across threads', function () {
    Thread::factory()->shared('abc123')->create();

    expect(fn () => Thread::factory()->shared('abc123')->create())
        ->toThrow(UniqueConstraintViolationException::class);
});

it('allows the same default_model_id across threads (no FK uniqueness)', function () {
    $model = LlmModel::factory()->create();
    Thread::factory()->count(3)->create(['default_model_id' => $model->id]);

    expect(Thread::where('default_model_id', $model->id)->count())->toBe(3);
});

it('nulls default_model_id when the model is deleted (per FK action)', function () {
    $model = LlmModel::factory()->create();
    $thread = Thread::factory()->create(['default_model_id' => $model->id]);

    $model->delete();

    expect($thread->fresh()->default_model_id)->toBeNull();
});

it('exposes the User -> threads HasMany relation', function () {
    $user = User::factory()->create();
    Thread::factory()->for($user)->count(2)->create();
    Thread::factory()->count(3)->create(); // belong to other users

    expect($user->threads()->count())->toBe(2);
});

it('orders runs by sequence_in_thread when accessed via the relation', function () {
    $thread = Thread::factory()->create();
    Run::factory()->for($thread)->create(['sequence_in_thread' => 3]);
    Run::factory()->for($thread)->create(['sequence_in_thread' => 1]);
    Run::factory()->for($thread)->create(['sequence_in_thread' => 2]);

    $sequences = $thread->runs->pluck('sequence_in_thread')->all();
    expect($sequences)->toBe([1, 2, 3]);
});

it('reports isShared() based on share_token presence', function () {
    expect(Thread::factory()->create()->isShared())->toBeFalse();
    expect(Thread::factory()->shared()->create()->isShared())->toBeTrue();
});
