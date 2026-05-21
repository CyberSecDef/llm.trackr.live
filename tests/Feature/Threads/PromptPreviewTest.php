<?php

use App\Enums\RunStatus;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * POST /threads/{thread}/preview — prompt-panel preview endpoint
 * (M7 chunk 6a). Returns history + token counts + context budget
 * without submitting a run.
 */

describe('auth & authorization', function () {
    it('redirects unauthenticated callers', function () {
        $thread = Thread::factory()->create();
        $model = LlmModel::factory()->create();

        $this->post("/threads/{$thread->id}/preview", [
            'prompt' => 'hi',
            'model_id' => $model->id,
        ])->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = Thread::factory()->for($owner)->create();
        $model = LlmModel::factory()->create();

        $this->actingAs($stranger)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'hi',
                'model_id' => $model->id,
            ])
            ->assertForbidden();
    });

    it('returns 404 for a nonexistent thread', function () {
        $user = User::factory()->create();
        $model = LlmModel::factory()->create();

        $this->actingAs($user)
            ->postJson('/threads/999999/preview', [
                'prompt' => 'hi',
                'model_id' => $model->id,
            ])
            ->assertNotFound();
    });
});

describe('validation', function () {
    it('accepts a missing or empty prompt and returns zero prompt-tokens', function () {
        // M12 user-testing fix: the frontend fires the preview on a
        // 400ms debounce as the user types — including the initial
        // empty-input state. The endpoint accepts a missing / null /
        // empty prompt and returns history + model info with a 0
        // prompt-token count, so the preview UI stays in sync.
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->create();

        $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", ['model_id' => $model->id])
            ->assertStatus(200)
            ->assertJsonPath('token_counts.prompt', 0);

        $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'model_id' => $model->id,
                'prompt' => '',
            ])
            ->assertStatus(200)
            ->assertJsonPath('token_counts.prompt', 0);
    });

    it('rejects when model_id is missing', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", ['prompt' => 'hi'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['model_id']);
    });

    it('rejects when model_id does not exist', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'hi',
                'model_id' => 999_999,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['model_id']);
    });
});

describe('response shape', function () {
    it('returns the expected top-level keys', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->create();

        $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'hi',
                'model_id' => $model->id,
            ])
            ->assertOk()
            ->assertJsonStructure([
                'history',
                'token_counts' => ['history', 'prompt', 'reserved', 'total'],
                'budget',
                'fits',
                'over_by',
                'model' => ['id', 'vendor', 'name', 'context_length'],
            ]);
    });
});

describe('history + token counts', function () {
    it('returns an empty history array for a fresh thread', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create([
            'system_prompt' => null,
        ]);
        $model = LlmModel::factory()->create();

        $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'hello',
                'model_id' => $model->id,
            ])
            ->assertJsonCount(0, 'history');
    });

    it('includes the system_prompt as the first history turn', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create([
            'system_prompt' => 'You are a helpful assistant.',
        ]);
        $model = LlmModel::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'hello',
                'model_id' => $model->id,
            ]);

        $response->assertJsonPath('history.0.role', 'system');
        $response->assertJsonPath('history.0.content', 'You are a helpful assistant.');
    });

    it('includes prior complete runs as user+assistant pairs', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        Run::factory()->for($user)->for($thread)->complete()->create([
            'sequence_in_thread' => 1,
            'prompt' => 'What is 2+2?',
            'output_text' => '4',
        ]);
        $model = LlmModel::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'next',
                'model_id' => $model->id,
            ]);

        $response->assertJsonPath('history.0.role', 'user');
        $response->assertJsonPath('history.0.content', 'What is 2+2?');
        $response->assertJsonPath('history.1.role', 'assistant');
        $response->assertJsonPath('history.1.content', '4');
    });

    it('skips incomplete / errored runs in history', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        Run::factory()->for($user)->for($thread)->complete()->create([
            'sequence_in_thread' => 1,
            'prompt' => 'kept',
            'output_text' => 'reply',
        ]);
        Run::factory()->for($user)->for($thread)->errored('boom')->create([
            'sequence_in_thread' => 2,
            'prompt' => 'dropped',
            'output_text' => null,
        ]);
        $model = LlmModel::factory()->create();

        $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'next',
                'model_id' => $model->id,
            ])
            ->assertJsonCount(2, 'history')
            ->assertJsonPath('history.0.content', 'kept');
    });

    it('computes non-zero token counts for non-empty prompt', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'The quick brown fox jumps over the lazy dog.',
                'model_id' => $model->id,
            ]);

        expect($response->json('token_counts.prompt'))->toBeGreaterThan(0);
        expect($response->json('token_counts.total'))
            ->toBe($response->json('token_counts.prompt') + $response->json('token_counts.history'));
    });

    it('factors max_tokens into reserved + total', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'hi',
                'model_id' => $model->id,
                'parameters' => ['max_tokens' => 500],
            ]);

        expect($response->json('token_counts.reserved'))->toBe(500);
        expect($response->json('token_counts.total'))->toBeGreaterThanOrEqual(500);
    });
});

describe('budget result', function () {
    it('reports fits=true when within the model context length', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->create(['context_length' => 4_096]);

        $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => 'hi',
                'model_id' => $model->id,
            ])
            ->assertJsonPath('fits', true)
            ->assertJsonPath('over_by', 0)
            ->assertJsonPath('budget', 4_096);
    });

    it('reports fits=false + over_by when the budget is exceeded', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->create(['context_length' => 5]);

        $response = $this->actingAs($user)
            ->postJson("/threads/{$thread->id}/preview", [
                'prompt' => str_repeat('extra-long prompt that overflows ', 20),
                'model_id' => $model->id,
            ]);

        $response->assertJsonPath('fits', false);
        expect($response->json('over_by'))->toBeGreaterThan(0);
    });
});

describe('isolation', function () {
    it('does not include another user\'s history', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $ownerThread = Thread::factory()->for($owner)->create();
        $strangerThread = Thread::factory()->for($stranger)->create();
        Run::factory()->for($stranger)->for($strangerThread)->complete()->create([
            'sequence_in_thread' => 1,
            'prompt' => 'STRANGER',
            'output_text' => 'leak?',
        ]);
        $model = LlmModel::factory()->create();

        $this->actingAs($owner)
            ->postJson("/threads/{$ownerThread->id}/preview", [
                'prompt' => 'hi',
                'model_id' => $model->id,
            ])
            ->assertJsonCount(0, 'history');

        // Status-related sanity: the only complete run in the system
        // belongs to the stranger, but it isn't in the owner's view.
        expect(Run::where('status', RunStatus::Complete)->count())->toBe(1);
    });
});
