<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function threadExportRoute(Thread $thread): string
{
    return "/threads/{$thread->id}/export.json";
}

function seedThreadWithRuns(User $user, int $count = 2): Thread
{
    $thread = Thread::factory()->for($user)->create([
        'title' => 'Quantum',
        'tags' => ['research'],
    ]);
    for ($i = 1; $i <= $count; $i++) {
        Run::factory()->for($user)->for($thread)->create([
            'sequence_in_thread' => $i,
            'status' => RunStatus::Complete,
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
            'prompt' => "p{$i}",
            'output_text' => "o{$i}",
            'token_log' => [
                ['token' => "tok{$i}", 'index' => 0, 't_ms' => 100, 'logprobs' => null],
            ],
        ]);
    }

    return $thread;
}

describe('GET /threads/{thread}/export.json — auth & ownership', function () {
    it('redirects unauthenticated callers to login', function () {
        $user = User::factory()->create();
        $thread = seedThreadWithRuns($user);

        $this->get(threadExportRoute($thread))->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = seedThreadWithRuns($owner);

        $this->actingAs($stranger)->get(threadExportRoute($thread))->assertForbidden();
    });

    it('returns 200 for the owner', function () {
        $user = User::factory()->create();
        $thread = seedThreadWithRuns($user);

        $this->actingAs($user)->get(threadExportRoute($thread))->assertStatus(200);
    });

    it('returns 404 for a nonexistent thread', function () {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/threads/999999/export.json')->assertNotFound();
    });
});

describe('GET /threads/{thread}/export.json — response shape', function () {
    it('returns Content-Disposition: attachment with thread-{id}.json filename', function () {
        $user = User::factory()->create();
        $thread = seedThreadWithRuns($user);

        $response = $this->actingAs($user)->get(threadExportRoute($thread));
        $cd = $response->headers->get('Content-Disposition');
        expect($cd)->toContain('attachment');
        expect($cd)->toContain("filename=\"thread-{$thread->id}.json\"");
    });

    it('returns application/json content type', function () {
        $user = User::factory()->create();
        $thread = seedThreadWithRuns($user);

        $response = $this->actingAs($user)->get(threadExportRoute($thread));
        expect($response->headers->get('Content-Type'))->toContain('application/json');
    });

    it('payload conforms to chunk-4 top-level shape', function () {
        $user = User::factory()->create();
        $thread = seedThreadWithRuns($user, 2);

        $this->actingAs($user)->get(threadExportRoute($thread))
            ->assertJsonStructure([
                'schema_version',
                'exported_at',
                'thread' => ['id', 'title', 'tags', 'archived', 'created_at', 'last_activity_at'],
                'runs' => [
                    '*' => [
                        'id',
                        'sequence_in_thread',
                        'status',
                        'prompt',
                        'output_text',
                        'token_log',
                        'parameters',
                    ],
                ],
            ])
            ->assertJson([
                'schema_version' => '1.0',
                'thread' => [
                    'id' => $thread->id,
                    'title' => 'Quantum',
                ],
            ])
            ->assertJsonCount(2, 'runs');
    });

    it('returns runs in sequence_in_thread asc order', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        foreach ([3, 1, 2] as $seq) {
            Run::factory()->for($user)->for($thread)->create([
                'sequence_in_thread' => $seq,
                'status' => RunStatus::Complete,
                'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
            ]);
        }

        $payload = $this->actingAs($user)->get(threadExportRoute($thread))->json();
        $sequences = array_map(fn ($r) => $r['sequence_in_thread'], $payload['runs']);
        expect($sequences)->toEqual([1, 2, 3]);
    });

    it('returns runs:[] for a thread with no runs', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        $payload = $this->actingAs($user)->get(threadExportRoute($thread))->json();
        expect($payload['runs'])->toEqual([]);
    });

    it('includes runs of every status (no filtering)', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        foreach (
            [
                [1, RunStatus::Complete],
                [2, RunStatus::Streaming],
                [3, RunStatus::Error],
                [4, RunStatus::Pending],
            ] as [$seq, $status]
        ) {
            Run::factory()->for($user)->for($thread)->create([
                'sequence_in_thread' => $seq,
                'status' => $status,
                'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
            ]);
        }

        $payload = $this->actingAs($user)->get(threadExportRoute($thread))->json();
        $statuses = array_map(fn ($r) => $r['status'], $payload['runs']);
        expect($statuses)->toEqual(['complete', 'streaming', 'error', 'pending']);
    });

    it('exported JSON parses cleanly through a round-trip', function () {
        $user = User::factory()->create();
        $thread = seedThreadWithRuns($user, 3);

        $body = $this->actingAs($user)->get(threadExportRoute($thread))->getContent();
        $parsed = json_decode($body, true, 512, JSON_THROW_ON_ERROR);

        expect($parsed['schema_version'])->toBe('1.0');
        expect($parsed['thread']['id'])->toBe($thread->id);
        expect($parsed['runs'])->toHaveCount(3);
        // Per-run shape is the chunk-3 RunExportSerializer::runSection
        // contract — verify a couple of fields survive the trip.
        expect($parsed['runs'][0]['prompt'])->toBe('p1');
        expect($parsed['runs'][0]['output_text'])->toBe('o1');
        expect($parsed['runs'][0]['token_log'])->toHaveCount(1);
    });

    it('does NOT include user_id in either the thread or run sections', function () {
        $user = User::factory()->create();
        $thread = seedThreadWithRuns($user);

        $payload = $this->actingAs($user)->get(threadExportRoute($thread))->json();
        expect($payload['thread'])->not->toHaveKey('user_id');
        foreach ($payload['runs'] as $run) {
            expect($run)->not->toHaveKey('user_id');
        }
    });
});
