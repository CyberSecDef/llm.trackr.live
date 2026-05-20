<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use App\Services\Runs\ThreadExportSerializer;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function buildExportableThread(int $runCount = 3, array $threadOverrides = []): Thread
{
    $user = User::factory()->create();
    $thread = Thread::factory()->for($user)->create(array_merge([
        'title' => 'Quantum entanglement',
        'tags' => ['research', 'physics'],
        'archived' => false,
    ], $threadOverrides));

    for ($i = 1; $i <= $runCount; $i++) {
        Run::factory()->for($user)->for($thread)->create([
            'sequence_in_thread' => $i,
            'status' => RunStatus::Complete,
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
            'prompt' => "prompt {$i}",
            'output_text' => "output {$i}",
            'token_log' => [
                ['token' => "tok{$i}", 'index' => 0, 't_ms' => 100, 'logprobs' => null],
            ],
        ]);
    }

    return $thread;
}

describe('ThreadExportSerializer', function () {
    it('emits schema_version 1.0 + exported_at + thread block', function () {
        $thread = buildExportableThread(2);
        $export = (new ThreadExportSerializer($thread))->build();

        expect($export['schema_version'])->toBe('1.0');
        expect($export['exported_at'])->toMatch('/^\d{4}-\d{2}-\d{2}T/');
        expect($export['thread']['id'])->toBe($thread->id);
        expect($export['thread']['title'])->toBe('Quantum entanglement');
        expect($export['thread']['tags'])->toEqual(['research', 'physics']);
        expect($export['thread']['archived'])->toBeFalse();
    });

    it('returns runs ordered by sequence_in_thread asc', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        // Insert in reverse order.
        foreach ([3, 1, 2] as $seq) {
            Run::factory()->for($user)->for($thread)->create([
                'sequence_in_thread' => $seq,
                'status' => RunStatus::Complete,
                'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
                'prompt' => "prompt {$seq}",
            ]);
        }

        $export = (new ThreadExportSerializer($thread))->build();
        $sequences = array_map(fn ($r) => $r['sequence_in_thread'], $export['runs']);
        expect($sequences)->toEqual([1, 2, 3]);
    });

    it('returns an empty runs array for a thread with no runs', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        $export = (new ThreadExportSerializer($thread))->build();
        expect($export['runs'])->toEqual([]);
    });

    it('includes all run statuses (pending, streaming, complete, error)', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        foreach (
            [
                ['seq' => 1, 'status' => RunStatus::Complete],
                ['seq' => 2, 'status' => RunStatus::Streaming],
                ['seq' => 3, 'status' => RunStatus::Error],
                ['seq' => 4, 'status' => RunStatus::Pending],
            ] as $row
        ) {
            Run::factory()->for($user)->for($thread)->create([
                'sequence_in_thread' => $row['seq'],
                'status' => $row['status'],
                'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
            ]);
        }

        $export = (new ThreadExportSerializer($thread))->build();
        expect($export['runs'])->toHaveCount(4);
        $statuses = array_map(fn ($r) => $r['status'], $export['runs']);
        expect($statuses)->toEqual(['complete', 'streaming', 'error', 'pending']);
    });

    it('each run section matches the chunk-3 RunExportSerializer::runSection shape', function () {
        $thread = buildExportableThread(1);
        $export = (new ThreadExportSerializer($thread))->build();
        $runSection = $export['runs'][0];

        // Spot-check the same field set the chunk-3 serializer
        // emits — proves the shared helper is being used.
        expect($runSection)->toHaveKeys([
            'id',
            'sequence_in_thread',
            'status',
            'prompt',
            'output_text',
            'error_message',
            'input_tokens',
            'output_tokens',
            'duration_ms',
            'tokens_per_second',
            'estimated_cost',
            'parameters',
            'conversation_history',
            'token_log',
            'created_at',
        ]);
        // Identity fields stripped (matches chunk-3 policy).
        expect($runSection)->not->toHaveKeys(['user_id', 'model_id', 'api_key_id']);
    });

    it('round-trips cleanly through json_encode / json_decode', function () {
        $thread = buildExportableThread(3);
        $export = (new ThreadExportSerializer($thread))->build();

        $json = json_encode($export, JSON_THROW_ON_ERROR);
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

        expect($decoded)->toEqual($export);
    });

    it('includes archived flag for archived threads', function () {
        $thread = buildExportableThread(0, ['archived' => true]);
        $export = (new ThreadExportSerializer($thread))->build();
        expect($export['thread']['archived'])->toBeTrue();
    });

    it('emits ISO8601 timestamps for created_at + last_activity_at', function () {
        $thread = buildExportableThread(1);
        $thread->update(['last_activity_at' => now()]);
        $export = (new ThreadExportSerializer($thread->fresh()))->build();

        expect($export['thread']['created_at'])->toMatch('/^\d{4}-\d{2}-\d{2}T/');
        expect($export['thread']['last_activity_at'])->toMatch('/^\d{4}-\d{2}-\d{2}T/');
    });
});
