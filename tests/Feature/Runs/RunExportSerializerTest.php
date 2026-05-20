<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use App\Services\Runs\RunExportSerializer;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function exportableRun(array $runOverrides = [], array $threadOverrides = [], array $userOverrides = []): Run
{
    $user = User::factory()->create($userOverrides);
    $thread = Thread::factory()->for($user)->create(array_merge([
        'title' => 'Quantum entanglement',
        'tags' => ['research', 'physics'],
    ], $threadOverrides));

    return Run::factory()->for($user)->for($thread)->create(array_merge([
        'status' => RunStatus::Complete,
        'parameters' => [
            'model_snapshot' => [
                'architecture_type' => 'dense',
                'layers' => 80,
                'context_length' => 128000,
            ],
            'temperature' => 0.7,
        ],
        'token_log' => [
            ['token' => 'Hello', 'index' => 0, 't_ms' => 100, 'logprobs' => null],
        ],
        'conversation_history' => [
            ['role' => 'user', 'content' => 'previous'],
            ['role' => 'assistant', 'content' => 'reply'],
        ],
        'prompt' => 'What is 2+2?',
        'output_text' => 'Hello',
        'input_tokens' => 10,
        'output_tokens' => 1,
        'duration_ms' => 250,
        'tokens_per_second' => 4.0,
        'estimated_cost' => 0.0001,
        'sequence_in_thread' => 3,
    ], $runOverrides));
}

describe('RunExportSerializer', function () {
    it('emits schema_version 1.0 + exported_at', function () {
        $export = (new RunExportSerializer(exportableRun()))->build();
        expect($export['schema_version'])->toBe('1.0');
        expect($export['exported_at'])->toBeString();
        // ISO8601: starts with year-month-day.
        expect($export['exported_at'])->toMatch('/^\d{4}-\d{2}-\d{2}T/');
    });

    it('includes thread { id, title, tags }', function () {
        $run = exportableRun();
        $export = (new RunExportSerializer($run))->build();
        expect($export['thread']['id'])->toBe($run->thread_id);
        expect($export['thread']['title'])->toBe('Quantum entanglement');
        expect($export['thread']['tags'])->toEqual(['research', 'physics']);
    });

    it('includes the full run section with metadata + parameters + token_log', function () {
        $run = exportableRun();
        $export = (new RunExportSerializer($run))->build();

        expect($export['run']['id'])->toBe($run->id);
        expect($export['run']['sequence_in_thread'])->toBe(3);
        expect($export['run']['status'])->toBe('complete');
        expect($export['run']['prompt'])->toBe('What is 2+2?');
        expect($export['run']['output_text'])->toBe('Hello');
        expect($export['run']['input_tokens'])->toBe(10);
        expect($export['run']['output_tokens'])->toBe(1);
        expect($export['run']['duration_ms'])->toBe(250);
        expect($export['run']['tokens_per_second'])->toBe(4.0);
        expect($export['run']['estimated_cost'])->toBe(0.0001);
        expect($export['run']['parameters']['model_snapshot']['layers'])->toBe(80);
        expect($export['run']['parameters']['temperature'])->toBe(0.7);
        expect($export['run']['token_log'])->toHaveCount(1);
        expect($export['run']['conversation_history'])->toHaveCount(2);
    });

    it('does NOT include user_id, api_key_id, or model_id', function () {
        $export = (new RunExportSerializer(exportableRun()))->build();
        expect($export['run'])->not->toHaveKey('user_id');
        expect($export['run'])->not->toHaveKey('api_key_id');
        expect($export['run'])->not->toHaveKey('model_id');
    });

    it('preserves the model_snapshot inside parameters (canonical replay source)', function () {
        $export = (new RunExportSerializer(exportableRun()))->build();
        expect($export['run']['parameters']['model_snapshot'])->toEqual([
            'architecture_type' => 'dense',
            'layers' => 80,
            'context_length' => 128000,
        ]);
    });

    it('respects users.store_prompts=false (prompt + history are null in DB → null in export)', function () {
        // Simulate a privacy-conscious user run: the DB has prompt + conversation_history null
        // (the value is set null at write time by the application — we mirror that here).
        $run = exportableRun([
            'prompt' => null,
            'conversation_history' => null,
        ]);

        $export = (new RunExportSerializer($run))->build();
        expect($export['run']['prompt'])->toBeNull();
        expect($export['run']['conversation_history'])->toBeNull();
        // Output text is always stored — should still be present.
        expect($export['run']['output_text'])->toBe('Hello');
    });

    it('includes error_message + partial output_text for errored runs', function () {
        $run = exportableRun([
            'status' => RunStatus::Error,
            'error_message' => 'Vendor rate-limited',
            'output_text' => 'partial output',
        ]);
        $export = (new RunExportSerializer($run))->build();
        expect($export['run']['status'])->toBe('error');
        expect($export['run']['error_message'])->toBe('Vendor rate-limited');
        expect($export['run']['output_text'])->toBe('partial output');
    });

    it('is deterministic except for the exported_at timestamp', function () {
        $run = exportableRun();
        $a = (new RunExportSerializer($run))->build();
        $b = (new RunExportSerializer($run))->build();

        unset($a['exported_at'], $b['exported_at']);
        expect($a)->toEqual($b);
    });

    it('round-trip: encodes to JSON and decodes back to an identical array', function () {
        $run = exportableRun();
        $export = (new RunExportSerializer($run))->build();

        $json = json_encode($export, JSON_THROW_ON_ERROR);
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

        expect($decoded)->toEqual($export);
    });

    it('handles a null thread relationship gracefully', function () {
        // Edge case: should never happen in production (run has FK to thread),
        // but the serializer shouldn't crash if the thread is force-deleted out
        // from under it before export.
        $run = exportableRun();
        // Force the relation cache to null without touching the DB.
        $run->setRelation('thread', null);
        $run->thread_id = 999_999; // make loadMissing a no-op
        // Wrap in a transaction-isolated assertion (no DB cleanup needed).
        $export = (new RunExportSerializer($run))->build();
        expect($export['thread'])->toBeNull();
        expect($export['run']['id'])->toBe($run->id);
    });
});
