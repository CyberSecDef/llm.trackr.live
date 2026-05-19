<?php

use App\Models\Run;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * GET /runs/{run}/events?since=N — WebSocket reconnect backfill
 * (M6 chunk 6). Lightweight JSON; companion to the WebSocket and SSE
 * transports.
 */

describe('GET /runs/{run}/events — authorization', function () {
    it('redirects unauthenticated callers to login', function () {
        $run = Run::factory()->create();

        $this->get("/runs/{$run->id}/events")->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $run = Run::factory()->for($owner)->create();

        $this->actingAs($stranger)->getJson("/runs/{$run->id}/events")->assertForbidden();
    });

    it('returns 404 for a nonexistent run', function () {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/runs/999999/events')->assertNotFound();
    });
});

describe('GET /runs/{run}/events — backfill behavior', function () {
    it('returns the entire token_log when since is omitted', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->streaming()->create([
            'token_log' => [
                ['token' => 'A', 'index' => 0, 't_ms' => 10],
                ['token' => 'B', 'index' => 1, 't_ms' => 20],
                ['token' => 'C', 'index' => 2, 't_ms' => 30],
            ],
        ]);

        $response = $this->actingAs($user)->getJson("/runs/{$run->id}/events");

        $response->assertOk();
        $response->assertJsonPath('since', 0);
        $response->assertJsonPath('cursor', 3);
        $response->assertJsonCount(3, 'token_log');
    });

    it('returns only entries from index N onward when since=N', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->streaming()->create([
            'token_log' => [
                ['token' => 'A', 'index' => 0, 't_ms' => 10],
                ['token' => 'B', 'index' => 1, 't_ms' => 20],
                ['token' => 'C', 'index' => 2, 't_ms' => 30],
            ],
        ]);

        $response = $this->actingAs($user)->getJson("/runs/{$run->id}/events?since=2");

        $response->assertJsonPath('since', 2);
        $response->assertJsonPath('cursor', 3);
        $response->assertJsonCount(1, 'token_log');
        $response->assertJsonPath('token_log.0.token', 'C');
    });

    it('returns an empty token_log when since equals cursor', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->streaming()->create([
            'token_log' => [
                ['token' => 'A', 'index' => 0, 't_ms' => 10],
            ],
        ]);

        $response = $this->actingAs($user)->getJson("/runs/{$run->id}/events?since=1");

        $response->assertOk();
        $response->assertJsonCount(0, 'token_log');
    });

    it('clamps negative since to 0', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->streaming()->create([
            'token_log' => [['token' => 'A', 'index' => 0, 't_ms' => 10]],
        ]);

        $response = $this->actingAs($user)->getJson("/runs/{$run->id}/events?since=-5");

        $response->assertJsonPath('since', 0);
        $response->assertJsonCount(1, 'token_log');
    });

    it('handles a run with no token_log yet', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create([
            'token_log' => null,
        ]);

        $response = $this->actingAs($user)->getJson("/runs/{$run->id}/events");

        $response->assertOk();
        $response->assertJsonPath('cursor', 0);
        $response->assertJsonCount(0, 'token_log');
    });
});

describe('GET /runs/{run}/events — terminal-state payload', function () {
    it('includes a completion block for Complete runs', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->complete()->create([
            'token_log' => [],
            'input_tokens' => 10,
            'output_tokens' => 25,
            'duration_ms' => 1500,
            'tokens_per_second' => 16.67,
            'estimated_cost' => 0.00125,
        ]);

        $response = $this->actingAs($user)->getJson("/runs/{$run->id}/events");

        $response->assertJsonPath('status', 'complete');
        $response->assertJsonPath('completion.input_tokens', 10);
        $response->assertJsonPath('completion.output_tokens', 25);
        $response->assertJsonPath('completion.tokens_per_second', 16.67);
        $response->assertJsonPath('completion.estimated_cost', 0.00125);
        $response->assertJsonPath('error', null);
    });

    it('includes an error block for Error runs', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->errored('Vendor rate limit')->create([
            'output_text' => 'partial',
            'token_log' => [],
        ]);

        $response = $this->actingAs($user)->getJson("/runs/{$run->id}/events");

        $response->assertJsonPath('status', 'error');
        $response->assertJsonPath('error.message', 'Vendor rate limit');
        $response->assertJsonPath('error.partial_output', 'partial');
        $response->assertJsonPath('completion', null);
    });

    it('omits both blocks for non-terminal runs', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->streaming()->create();

        $response = $this->actingAs($user)->getJson("/runs/{$run->id}/events");

        $response->assertJsonPath('status', 'streaming');
        $response->assertJsonPath('completion', null);
        $response->assertJsonPath('error', null);
    });
});
