<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use App\Services\Threads\ConversationHistoryBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->builder = app(ConversationHistoryBuilder::class);
});

it('returns an empty array for a brand-new thread', function () {
    $thread = Thread::factory()->create();

    expect($this->builder->build($thread))->toBe([]);
});

it('prepends the thread system_prompt as a system message when set', function () {
    $thread = Thread::factory()->withSystemPrompt('be terse')->create();

    expect($this->builder->build($thread))->toBe([
        ['role' => 'system', 'content' => 'be terse'],
    ]);
});

it('ignores empty / whitespace-only system_prompt', function () {
    foreach (['', '   ', "\n\t"] as $blank) {
        $thread = Thread::factory()->create(['system_prompt' => $blank]);
        expect($this->builder->build($thread))->toBe([]);
    }
});

it('includes prior completed runs in (user, assistant) pairs', function () {
    $thread = Thread::factory()->create();

    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 1,
        'prompt' => 'first question',
        'output_text' => 'first answer',
    ]);
    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 2,
        'prompt' => 'second question',
        'output_text' => 'second answer',
    ]);

    expect($this->builder->build($thread))->toBe([
        ['role' => 'user', 'content' => 'first question'],
        ['role' => 'assistant', 'content' => 'first answer'],
        ['role' => 'user', 'content' => 'second question'],
        ['role' => 'assistant', 'content' => 'second answer'],
    ]);
});

it('orders runs by sequence_in_thread, not insertion order', function () {
    $thread = Thread::factory()->create();

    // Insert out of order.
    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 2,
        'prompt' => 'second q',
        'output_text' => 'second a',
    ]);
    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 1,
        'prompt' => 'first q',
        'output_text' => 'first a',
    ]);

    $history = $this->builder->build($thread);

    expect($history[0]['content'])->toBe('first q');
    expect($history[2]['content'])->toBe('second q');
});

it('excludes pending / streaming / errored runs', function () {
    $thread = Thread::factory()->create();

    Run::factory()->for($thread)->create([
        'sequence_in_thread' => 1,
        'prompt' => 'pending q',
        'status' => RunStatus::Pending,
    ]);
    Run::factory()->for($thread)->streaming()->create([
        'sequence_in_thread' => 2,
        'prompt' => 'streaming q',
    ]);
    Run::factory()->for($thread)->errored()->create([
        'sequence_in_thread' => 3,
        'prompt' => 'errored q',
    ]);
    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 4,
        'prompt' => 'completed q',
        'output_text' => 'completed a',
    ]);

    expect($this->builder->build($thread))->toBe([
        ['role' => 'user', 'content' => 'completed q'],
        ['role' => 'assistant', 'content' => 'completed a'],
    ]);
});

it('skips privacy-redacted runs (null prompt)', function () {
    $thread = Thread::factory()->create();

    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 1,
        'prompt' => 'normal q',
        'output_text' => 'normal a',
    ]);
    Run::factory()->for($thread)->complete()->privacyRedacted()->create([
        'sequence_in_thread' => 2,
        'output_text' => 'redacted output present but no prompt',
    ]);
    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 3,
        'prompt' => 'another normal q',
        'output_text' => 'another normal a',
    ]);

    // Middle run should be skipped entirely (no half-pair).
    expect($this->builder->build($thread))->toHaveCount(4);
});

it('skips runs with null output_text', function () {
    $thread = Thread::factory()->create();

    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 1,
        'prompt' => 'q',
        'output_text' => null, // somehow marked complete without text
    ]);

    expect($this->builder->build($thread))->toBe([]);
});

it('combines system_prompt + completed-run history correctly', function () {
    $thread = Thread::factory()->withSystemPrompt('always reply in JSON')->create();
    Run::factory()->for($thread)->complete()->create([
        'sequence_in_thread' => 1,
        'prompt' => 'hi',
        'output_text' => '{"reply":"hello"}',
    ]);

    expect($this->builder->build($thread))->toBe([
        ['role' => 'system', 'content' => 'always reply in JSON'],
        ['role' => 'user', 'content' => 'hi'],
        ['role' => 'assistant', 'content' => '{"reply":"hello"}'],
    ]);
});

it('ignores runs from other threads', function () {
    $threadA = Thread::factory()->create();
    $threadB = Thread::factory()->create();

    Run::factory()->for($threadA)->complete()->create([
        'sequence_in_thread' => 1,
        'prompt' => 'A q',
        'output_text' => 'A a',
    ]);
    Run::factory()->for($threadB)->complete()->create([
        'sequence_in_thread' => 1,
        'prompt' => 'B q',
        'output_text' => 'B a',
    ]);

    $historyA = $this->builder->build($threadA);
    expect($historyA)->toHaveCount(2);
    expect($historyA[0]['content'])->toBe('A q');
});
