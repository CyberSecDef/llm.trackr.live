<?php

use App\Enums\RunStatus;
use App\Jobs\StreamRunJob;
use App\Models\ApiKey;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;

uses(RefreshDatabase::class);

/*
 * POST /threads/{thread}/runs — the run-submission endpoint (M6 chunk 4a).
 *
 * Tests cover authn/authz, FormRequest validation, service-exception →
 * HTTP mapping, success shape, side effects (run persisted, job
 * dispatched), and the rate-limit headers wired by the 'runs' limiter.
 */

/**
 * Build a (user, thread, model, api-key) quad suitable for a successful
 * submission. Returns each piece so individual tests can poke at them.
 *
 * @return array{user: User, thread: Thread, model: LlmModel, apiKey: ApiKey}
 */
function submittableQuad(string $vendor = 'openai'): array
{
    $user = User::factory()->create();
    $thread = Thread::factory()->for($user)->create(['title' => null]);
    $model = LlmModel::factory()->vendor($vendor)->create();
    $apiKey = ApiKey::factory()->for($user)->vendor($vendor)->create();

    return compact('user', 'thread', 'model', 'apiKey');
}

describe('POST /threads/{thread}/runs — auth & authorization', function () {
    it('returns 401 for unauthenticated callers', function () {
        $thread = Thread::factory()->create();

        $response = $this->postJson("/threads/{$thread->id}/runs", [
            'model_id' => 1,
            'prompt' => 'hi',
        ]);

        $response->assertUnauthorized();
    });

    it('returns 403 when authed user does not own the thread', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = Thread::factory()->for($owner)->create();
        $model = LlmModel::factory()->create();
        ApiKey::factory()->for($stranger)->vendor($model->vendor)->create();

        $response = $this->actingAs($stranger)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'hi there',
        ]);

        $response->assertForbidden();
    });
});

describe('POST /threads/{thread}/runs — FormRequest validation', function () {
    it('returns 422 when prompt is missing', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['prompt']);
    });

    it('returns 422 when prompt is empty', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => '',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['prompt']);
    });

    it('returns 422 when model_id is missing', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'prompt' => 'hi',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['model_id']);
    });

    it('returns 422 when model_id does not exist', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => 999999,
            'prompt' => 'hi',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['model_id']);
    });

    it('returns 422 when temperature is out of range', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'hi',
            'parameters' => ['temperature' => 3.5],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['parameters.temperature']);
    });

    it('returns 422 when top_p is out of range', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'hi',
            'parameters' => ['top_p' => 1.5],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['parameters.top_p']);
    });

    it('returns 422 when max_tokens is < 1', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'hi',
            'parameters' => ['max_tokens' => 0],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['parameters.max_tokens']);
    });
});

describe('POST /threads/{thread}/runs — service exception mapping', function () {
    it('returns 422 with the vendor name when the user has no API key', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->vendor('anthropic')->create();
        // No API key for anthropic.

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'hi',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['model_id']);
        expect($response->json('errors.model_id.0'))->toContain("vendor 'anthropic'");
    });

    it('returns 422 when context overflow', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();
        // Force a tiny context so any prompt overflows.
        $model->update(['context_length' => 5]);

        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => str_repeat('this is a long prompt ', 20),
            'parameters' => ['max_tokens' => 1000],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['prompt']);
        expect($response->json('errors.prompt.0'))->toContain('context window');
    });
});

describe('POST /threads/{thread}/runs — success', function () {
    it('persists a Pending run, dispatches StreamRunJob, and returns 201 + channel', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();

        Bus::fake();
        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'What is the capital of France?',
            'parameters' => ['temperature' => 0.5],
        ]);

        $response->assertCreated();
        $response->assertJsonStructure([
            'run' => ['id', 'thread_id', 'model_id', 'sequence_in_thread', 'status', 'created_at'],
            'channel',
        ]);
        $runId = $response->json('run.id');
        expect($response->json('run.status'))->toBe('pending');
        expect($response->json('channel'))->toBe("private-runs.{$runId}");

        $run = Run::find($runId);
        expect($run)->not->toBeNull();
        expect($run->status)->toBe(RunStatus::Pending);
        expect($run->thread_id)->toBe($thread->id);
        expect($run->user_id)->toBe($user->id);
        expect($run->model_id)->toBe($model->id);
        expect($run->prompt)->toBe('What is the capital of France?');
        expect($run->parameters['temperature'])->toBe(0.5);
        expect($run->parameters)->toHaveKey('model_snapshot');

        Bus::assertDispatched(StreamRunJob::class, fn ($job) => $job->run->id === $runId);
    });

    it('auto-titles the thread from the first prompt', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();
        expect($thread->title)->toBeNull();

        Bus::fake();
        $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'Explain quantum entanglement in plain English',
        ])->assertCreated();

        $thread->refresh();
        expect($thread->title)->toBe('Explain quantum entanglement in plain English');
    });

    it('bumps last_activity_at on submit', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();
        $thread->update(['last_activity_at' => now()->subDays(7)]);
        $before = $thread->fresh()->last_activity_at;

        Bus::fake();
        $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'hi',
        ])->assertCreated();

        expect($thread->fresh()->last_activity_at->gt($before))->toBeTrue();
    });

    it('emits rate-limit headers', function () {
        ['user' => $user, 'thread' => $thread, 'model' => $model] = submittableQuad();

        Bus::fake();
        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'hi',
        ]);

        $response->assertHeader('X-RateLimit-Limit');
        $response->assertHeader('X-RateLimit-Remaining');
    });

    it('passes through the Meta→Together API key fallback', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->vendor('meta')->create();
        // Together key, no meta key — RunService falls back to together.
        ApiKey::factory()->for($user)->vendor('together')->create();

        Bus::fake();
        $response = $this->actingAs($user)->postJson("/threads/{$thread->id}/runs", [
            'model_id' => $model->id,
            'prompt' => 'hi llama',
        ]);

        $response->assertCreated();
        Bus::assertDispatched(StreamRunJob::class);
    });
});
