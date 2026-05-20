<?php

use App\Enums\RunStatus;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function makeSharedThreadWithRun(
    array $userOverrides = [],
    array $runOverrides = [],
): array {
    $user = User::factory()->create($userOverrides);
    $thread = Thread::factory()->for($user)->create([
        'share_token' => str_repeat('a', 32),
        'share_enabled_at' => now(),
    ]);
    $model = LlmModel::factory()->create([
        'vendor' => 'openai',
        'display_name' => 'GPT-4o',
    ]);
    $run = Run::factory()->for($user)->for($thread)->create(array_merge([
        'model_id' => $model->id,
        'status' => RunStatus::Complete,
        'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
        'token_log' => [
            ['token' => 'Hello', 'index' => 0, 't_ms' => 100, 'logprobs' => null],
        ],
        'sequence_in_thread' => 1,
        'prompt' => 'Hi',
        'output_text' => 'Hello',
    ], $runOverrides));

    return [$user, $thread, $run];
}

describe('GET /share/{token}/runs/{run}/replay — token resolution', function () {
    it('returns 404 for an unknown token', function () {
        [, $thread, $run] = makeSharedThreadWithRun();
        $this->get('/share/' . str_repeat('z', 32) . "/runs/{$run->id}/replay")->assertNotFound();
    });

    it('returns 404 when share_token is null on the resolved thread', function () {
        // This shouldn't be reachable in practice (token can't be both
        // null and match the URL) but the controller's whereNotNull
        // guard exists to prevent any accidental SQL coincidence.
        [, $thread, $run] = makeSharedThreadWithRun();
        $thread->update(['share_token' => null]);

        $this->get('/share/' . str_repeat('a', 32) . "/runs/{$run->id}/replay")->assertNotFound();
    });
});

describe('GET /share/{token}/runs/{run}/replay — cross-thread defense', function () {
    it('returns 404 when the run belongs to a different thread than the token', function () {
        $owner = User::factory()->create();
        $sharedThread = Thread::factory()->for($owner)->create([
            'share_token' => str_repeat('a', 32),
            'share_enabled_at' => now(),
        ]);
        // A run on a DIFFERENT thread (also belonging to the same
        // owner, even — but not the shared one).
        $privateThread = Thread::factory()->for($owner)->create();
        $privateRun = Run::factory()->for($owner)->for($privateThread)->create([
            'status' => RunStatus::Complete,
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
        ]);

        $this->get('/share/' . str_repeat('a', 32) . "/runs/{$privateRun->id}/replay")
            ->assertNotFound();
    });
});

describe('GET /share/{token}/runs/{run}/replay — status', function () {
    it('returns 422 for non-terminal runs', function () {
        [, $thread, $run] = makeSharedThreadWithRun([], ['status' => RunStatus::Streaming]);

        $this->get('/share/' . $thread->share_token . "/runs/{$run->id}/replay")
            ->assertStatus(422);
    });

    it('serves 200 for errored runs (partial output is still replayable)', function () {
        [, $thread, $run] = makeSharedThreadWithRun([], [
            'status' => RunStatus::Error,
            'error_message' => 'Vendor rate-limited',
        ]);

        $this->get('/share/' . $thread->share_token . "/runs/{$run->id}/replay")->assertOk();
    });
});

describe('GET /share/{token}/runs/{run}/replay — render shape', function () {
    it('renders the Share/Replay component with sanitized props', function () {
        [, $thread, $run] = makeSharedThreadWithRun();

        $this->get('/share/' . $thread->share_token . "/runs/{$run->id}/replay")->assertInertia(
            fn ($page) => $page
                ->component('Share/Replay')
                ->where('token', $thread->share_token)
                ->where('run.id', $run->id)
                ->has('events')
                ->has('model'),
        );
    });

    it('includes synthesized events (run.started + token + run.completed)', function () {
        [, $thread, $run] = makeSharedThreadWithRun([], [
            'token_log' => [
                ['token' => 'A', 'index' => 0, 't_ms' => 100, 'logprobs' => null],
                ['token' => 'B', 'index' => 1, 't_ms' => 200, 'logprobs' => null],
            ],
        ]);

        $this->get('/share/' . $thread->share_token . "/runs/{$run->id}/replay")->assertInertia(
            fn ($page) => $page
                ->has('events', 6) // 1 started + 2 × 2 events + 1 completed
                ->where('events.0.event', 'run.started')
                ->where('events.5.event', 'run.completed'),
        );
    });

    it('redacts null prompt when owner store_prompts=false', function () {
        [, $thread, $run] = makeSharedThreadWithRun(
            ['store_prompts' => false],
            ['prompt' => null],
        );

        $this->get('/share/' . $thread->share_token . "/runs/{$run->id}/replay")->assertInertia(
            fn ($page) => $page
                ->where('run.prompt', '[prompt redacted by author]')
                ->where('prompts_redacted', true),
        );
    });

    it('does not redact when owner store_prompts=true', function () {
        [, $thread, $run] = makeSharedThreadWithRun(
            ['store_prompts' => true],
            ['prompt' => 'Hello'],
        );

        $this->get('/share/' . $thread->share_token . "/runs/{$run->id}/replay")->assertInertia(
            fn ($page) => $page
                ->where('run.prompt', 'Hello')
                ->where('prompts_redacted', false),
        );
    });

    it('serves anonymously (no auth)', function () {
        [, $thread, $run] = makeSharedThreadWithRun();
        // No actingAs() — pure anonymous request.
        $this->get('/share/' . $thread->share_token . "/runs/{$run->id}/replay")->assertOk();
    });
});
