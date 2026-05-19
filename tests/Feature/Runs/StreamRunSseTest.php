<?php

use App\Models\Run;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * GET /runs/{run}/stream — SSE fallback for clients that can't
 * WebSocket (M6 chunk 5a).
 *
 * Tests work against already-terminal runs so the controller's poll
 * loop exits on the first iteration (no sleep, no hanging FPM
 * worker). Live transitions are covered by the chunk-3 incremental-
 * write test on StreamRunJob — the SSE controller just reads the
 * persisted state.
 */

/**
 * Parse the streamed SSE body into an ordered list of frames.
 *
 * @return list<array{event: string, data: array<string, mixed>}>
 */
function parseSse(string $body): array
{
    $frames = [];
    // SSE frames are separated by blank lines.
    foreach (preg_split("/\n\n/", trim($body)) as $raw) {
        $raw = trim($raw);
        if ($raw === '' || str_starts_with($raw, ':')) {
            // Skip empty + heartbeat-comment frames.
            continue;
        }
        $event = null;
        $data = null;
        foreach (explode("\n", $raw) as $line) {
            if (str_starts_with($line, 'event: ')) {
                $event = substr($line, 7);
            } elseif (str_starts_with($line, 'data: ')) {
                $data = json_decode(substr($line, 6), true);
            }
        }
        if ($event !== null && $data !== null) {
            $frames[] = ['event' => $event, 'data' => $data];
        }
    }

    return $frames;
}

describe('GET /runs/{run}/stream — auth & authorization', function () {
    it('redirects unauthenticated callers to login', function () {
        $run = Run::factory()->create();

        $this->get("/runs/{$run->id}/stream")->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $run = Run::factory()->for($owner)->create();

        $this->actingAs($stranger)->get("/runs/{$run->id}/stream")->assertForbidden();
    });

    it('returns 404 for a nonexistent run', function () {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/runs/999999/stream')->assertNotFound();
    });
});

describe('GET /runs/{run}/stream — response shape', function () {
    it('returns text/event-stream with no-buffering headers', function () {
        $user = User::factory()->create();
        $run = Run::factory()
            ->for($user)
            ->complete()
            ->create();

        $response = $this->actingAs($user)->get("/runs/{$run->id}/stream");

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/event-stream; charset=UTF-8');
        $response->assertHeader('X-Accel-Buffering', 'no');
        $response->assertHeader('Cache-Control', 'no-cache, private');
    });
});

describe('GET /runs/{run}/stream — SSE emission for a Complete run', function () {
    it('emits run.started, token.received per token_log entry, layer.advanced per entry, and run.completed', function () {
        $user = User::factory()->create();
        $run = Run::factory()
            ->for($user)
            ->complete()
            ->create([
                'token_log' => [
                    ['token' => 'Hello', 'index' => 0, 't_ms' => 100, 'logprobs' => null],
                    ['token' => ' world', 'index' => 1, 't_ms' => 200, 'logprobs' => null],
                ],
                'output_text' => 'Hello world',
                'input_tokens' => 4,
                'output_tokens' => 2,
                'duration_ms' => 1000,
                'tokens_per_second' => 2.0,
                'estimated_cost' => 0.0005,
                'parameters' => ['model_snapshot' => ['layers' => 32]],
            ]);

        $body = $this->actingAs($user)->get("/runs/{$run->id}/stream")->streamedContent();
        $frames = parseSse($body);
        $events = array_map(fn ($f) => $f['event'], $frames);

        expect($events[0])->toBe('run.started');
        // Two tokens × (token.received + layer.advanced) = 4 events.
        expect($events)->toContain('token.received');
        expect($events)->toContain('layer.advanced');
        expect($events[count($events) - 1])->toBe('run.completed');
    });

    it('carries the token data verbatim from token_log', function () {
        $user = User::factory()->create();
        $run = Run::factory()
            ->for($user)
            ->complete()
            ->create([
                'token_log' => [
                    ['token' => 'A', 'index' => 0, 't_ms' => 50, 'logprobs' => [['token' => 'A', 'logprob' => -0.1]]],
                ],
                'parameters' => ['model_snapshot' => ['layers' => 32]],
            ]);

        $body = $this->actingAs($user)->get("/runs/{$run->id}/stream")->streamedContent();
        $frames = parseSse($body);
        $token = collect($frames)->firstWhere('event', 'token.received');

        expect($token['data']['token'])->toBe('A');
        expect($token['data']['index'])->toBe(0);
        expect($token['data']['t_ms'])->toBe(50);
        expect($token['data']['logprobs'])->toBe([['token' => 'A', 'logprob' => -0.1]]);
    });

    it('carries usage + cost in the final run.completed frame', function () {
        $user = User::factory()->create();
        $run = Run::factory()
            ->for($user)
            ->complete()
            ->create([
                'input_tokens' => 10,
                'output_tokens' => 25,
                'duration_ms' => 1500,
                'tokens_per_second' => 16.67,
                'estimated_cost' => 0.00125,
                'token_log' => [],
                'parameters' => ['model_snapshot' => ['layers' => 32]],
            ]);

        $body = $this->actingAs($user)->get("/runs/{$run->id}/stream")->streamedContent();
        $frames = parseSse($body);
        $completed = collect($frames)->firstWhere('event', 'run.completed');

        expect($completed['data']['input_tokens'])->toBe(10);
        expect($completed['data']['output_tokens'])->toBe(25);
        expect($completed['data']['duration_ms'])->toBe(1500);
        expect($completed['data']['tokens_per_second'])->toBe(16.67);
        expect($completed['data']['estimated_cost'])->toBe(0.00125);
    });

    it('uses the layer count from the model snapshot for layer.advanced events', function () {
        $user = User::factory()->create();
        $run = Run::factory()
            ->for($user)
            ->complete()
            ->create([
                'token_log' => [['token' => 'x', 'index' => 0, 't_ms' => 10, 'logprobs' => null]],
                'parameters' => ['model_snapshot' => ['layers' => 80]],
            ]);

        $body = $this->actingAs($user)->get("/runs/{$run->id}/stream")->streamedContent();
        $frames = parseSse($body);
        $layer = collect($frames)->firstWhere('event', 'layer.advanced');

        expect($layer['data']['total_layers'])->toBe(80);
    });
});

describe('GET /runs/{run}/stream — SSE emission for an Error run', function () {
    it('emits run.errored with the error message + partial output', function () {
        $user = User::factory()->create();
        $run = Run::factory()
            ->for($user)
            ->errored('Vendor rate limit')
            ->create([
                'output_text' => 'partial response',
                'token_log' => [['token' => 'part', 'index' => 0, 't_ms' => 10, 'logprobs' => null]],
                'parameters' => ['model_snapshot' => ['layers' => 32]],
            ]);

        $body = $this->actingAs($user)->get("/runs/{$run->id}/stream")->streamedContent();
        $frames = parseSse($body);
        $errored = collect($frames)->firstWhere('event', 'run.errored');

        expect($errored)->not->toBeNull();
        expect($errored['data']['message'])->toBe('Vendor rate limit');
        expect($errored['data']['partial_output'])->toBe('partial response');
    });

    it('still drains the partial token_log before emitting run.errored', function () {
        $user = User::factory()->create();
        $run = Run::factory()
            ->for($user)
            ->errored('boom')
            ->create([
                'output_text' => 'a b',
                'token_log' => [
                    ['token' => 'a', 'index' => 0, 't_ms' => 1, 'logprobs' => null],
                    ['token' => ' b', 'index' => 1, 't_ms' => 2, 'logprobs' => null],
                ],
                'parameters' => ['model_snapshot' => ['layers' => 32]],
            ]);

        $body = $this->actingAs($user)->get("/runs/{$run->id}/stream")->streamedContent();
        $frames = parseSse($body);
        $events = array_map(fn ($f) => $f['event'], $frames);

        // Two tokens emitted before the run.errored close.
        $erroredIndex = array_search('run.errored', $events, true);
        $tokensBefore = collect($frames)->take($erroredIndex)->where('event', 'token.received')->count();
        expect($tokensBefore)->toBe(2);
    });
});
