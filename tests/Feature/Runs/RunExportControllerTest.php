<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function exportRoute(Run $run): string
{
    return "/runs/{$run->id}/export.json";
}

function makeOwnedRun(User $user, array $overrides = []): Run
{
    $thread = Thread::factory()->for($user)->create();

    return Run::factory()->for($user)->for($thread)->create(array_merge([
        'status' => RunStatus::Complete,
        'parameters' => [
            'model_snapshot' => [
                'architecture_type' => 'dense',
                'layers' => 32,
            ],
        ],
        'prompt' => 'hello',
        'output_text' => 'world',
        'token_log' => [
            ['token' => 'world', 'index' => 0, 't_ms' => 100, 'logprobs' => null],
        ],
        'sequence_in_thread' => 1,
    ], $overrides));
}

describe('GET /runs/{run}/export.json — auth & ownership', function () {
    it('redirects unauthenticated callers to login', function () {
        $user = User::factory()->create();
        $run = makeOwnedRun($user);

        $this->get(exportRoute($run))->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $run = makeOwnedRun($owner);

        $this->actingAs($stranger)->get(exportRoute($run))->assertForbidden();
    });

    it('returns 200 for the owner', function () {
        $user = User::factory()->create();
        $run = makeOwnedRun($user);

        $this->actingAs($user)->get(exportRoute($run))->assertStatus(200);
    });
});

describe('GET /runs/{run}/export.json — response shape', function () {
    it('returns Content-Disposition: attachment with run-{id}.json filename', function () {
        $user = User::factory()->create();
        $run = makeOwnedRun($user);

        $response = $this->actingAs($user)->get(exportRoute($run));
        $cd = $response->headers->get('Content-Disposition');
        expect($cd)->toContain('attachment');
        expect($cd)->toContain("filename=\"run-{$run->id}.json\"");
    });

    it('returns application/json content type', function () {
        $user = User::factory()->create();
        $run = makeOwnedRun($user);

        $response = $this->actingAs($user)->get(exportRoute($run));
        expect($response->headers->get('Content-Type'))->toContain('application/json');
    });

    it('payload conforms to schema 1.0 top-level shape', function () {
        $user = User::factory()->create();
        $run = makeOwnedRun($user);

        $this->actingAs($user)->get(exportRoute($run))
            ->assertJsonStructure([
                'schema_version',
                'exported_at',
                'thread' => ['id', 'title', 'tags'],
                'run' => [
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
                ],
            ])
            ->assertJson(['schema_version' => '1.0']);
    });

    it('does NOT include user_id / model_id / api_key_id in the run section', function () {
        $user = User::factory()->create();
        $run = makeOwnedRun($user);

        $response = $this->actingAs($user)->get(exportRoute($run))
            ->json('run');
        expect($response)->not->toHaveKey('user_id');
        expect($response)->not->toHaveKey('model_id');
        expect($response)->not->toHaveKey('api_key_id');
    });

    it('exported JSON parses cleanly through a round-trip (schema-stability)', function () {
        $user = User::factory()->create();
        $run = makeOwnedRun($user, [
            'parameters' => [
                'model_snapshot' => [
                    'architecture_type' => 'moe',
                    'layers' => 32,
                    'moe_experts' => 8,
                    'moe_active_experts' => 2,
                ],
                'temperature' => 0.5,
            ],
            'output_tokens' => 3,
            'duration_ms' => 300,
            'token_log' => [
                ['token' => 'A', 'index' => 0, 't_ms' => 100, 'logprobs' => null],
                ['token' => 'B', 'index' => 1, 't_ms' => 200, 'logprobs' => null],
                ['token' => 'C', 'index' => 2, 't_ms' => 300, 'logprobs' => null],
            ],
        ]);

        $body = $this->actingAs($user)->get(exportRoute($run))->getContent();
        $parsed = json_decode($body, true, 512, JSON_THROW_ON_ERROR);

        // Spot-check every field round-tripped intact.
        expect($parsed['schema_version'])->toBe('1.0');
        expect($parsed['run']['id'])->toBe($run->id);
        expect($parsed['run']['status'])->toBe('complete');
        expect($parsed['run']['output_text'])->toBe('world');
        expect($parsed['run']['token_log'])->toHaveCount(3);
        expect($parsed['run']['parameters']['model_snapshot']['moe_experts'])->toBe(8);
        expect($parsed['run']['parameters']['temperature'])->toBe(0.5);
    });

    it('respects store_prompts=false (prompt + conversation_history null in DB → null in export)', function () {
        // Simulate the privacy redaction: the application writes null
        // when users.store_prompts is false. The export must mirror
        // that — never reconstruct or fall back to the prompt_hash.
        $user = User::factory()->create();
        $run = makeOwnedRun($user, [
            'prompt' => null,
            'conversation_history' => null,
        ]);

        $payload = $this->actingAs($user)->get(exportRoute($run))->json();
        expect($payload['run']['prompt'])->toBeNull();
        expect($payload['run']['conversation_history'])->toBeNull();
        // output_text is always stored — should be present.
        expect($payload['run']['output_text'])->toBe('world');
    });

    it('exports errored runs with error_message + partial output', function () {
        $user = User::factory()->create();
        $run = makeOwnedRun($user, [
            'status' => RunStatus::Error,
            'error_message' => 'Vendor rate-limited',
            'output_text' => 'partial',
        ]);

        $payload = $this->actingAs($user)->get(exportRoute($run))->json();
        expect($payload['run']['status'])->toBe('error');
        expect($payload['run']['error_message'])->toBe('Vendor rate-limited');
        expect($payload['run']['output_text'])->toBe('partial');
    });
});
