<?php

use App\Enums\RunStatus;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function replayUrl(Thread $thread, Run $run): string
{
    return "/threads/{$thread->id}/runs/{$run->id}/replay";
}

function makeCompleteRun(User $user, Thread $thread, array $tokenLog = []): Run
{
    $model = LlmModel::factory()->create([
        'vendor' => 'openai',
        'display_name' => 'GPT-4o',
        'context_length' => 128000,
    ]);

    return Run::factory()->for($user)->for($thread)->create([
        'model_id' => $model->id,
        'status' => RunStatus::Complete,
        'parameters' => [
            'model_snapshot' => [
                'architecture_type' => 'dense',
                'layers' => 80,
            ],
        ],
        'prompt' => 'What is 2+2?',
        'output_text' => '4',
        'token_log' => $tokenLog ?: [
            ['token' => '4', 'index' => 0, 't_ms' => 100, 'logprobs' => null],
        ],
        'input_tokens' => 10,
        'output_tokens' => 1,
        'duration_ms' => 100,
        'estimated_cost' => 0.0001,
    ]);
}

describe('GET /threads/{thread}/runs/{run}/replay — auth & ownership', function () {
    it('redirects unauthenticated callers to login', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $run = makeCompleteRun($user, $thread);

        $this->get(replayUrl($thread, $run))->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = Thread::factory()->for($owner)->create();
        $run = makeCompleteRun($owner, $thread);

        $this->actingAs($stranger)->get(replayUrl($thread, $run))->assertForbidden();
    });

    it('returns 404 when the run belongs to a different thread', function () {
        $user = User::factory()->create();
        $threadA = Thread::factory()->for($user)->create();
        $threadB = Thread::factory()->for($user)->create();
        $runInA = makeCompleteRun($user, $threadA);

        // URL references threadB but the run is in threadA → 404.
        $this->actingAs($user)
            ->get("/threads/{$threadB->id}/runs/{$runInA->id}/replay")
            ->assertNotFound();
    });

    it('returns 422 for non-terminal runs (pending / streaming)', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->create();
        $run = Run::factory()->for($user)->for($thread)->create([
            'model_id' => $model->id,
            'status' => RunStatus::Streaming,
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
        ]);

        $this->actingAs($user)
            ->get(replayUrl($thread, $run))
            ->assertStatus(422);
    });

    it('serves replay for an errored run (partial output is still replayable)', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $model = LlmModel::factory()->create();
        $run = Run::factory()->for($user)->for($thread)->create([
            'model_id' => $model->id,
            'status' => RunStatus::Error,
            'error_message' => 'Vendor rate-limited',
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
            'token_log' => [
                ['token' => 'partial', 'index' => 0, 't_ms' => 50, 'logprobs' => null],
            ],
        ]);

        $this->actingAs($user)->get(replayUrl($thread, $run))->assertStatus(200);
    });
});

describe('GET /threads/{thread}/runs/{run}/replay — render shape', function () {
    it('renders the Runs/Replay Inertia component', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $run = makeCompleteRun($user, $thread);

        $this->actingAs($user)->get(replayUrl($thread, $run))->assertInertia(
            fn ($page) => $page
                ->component('Runs/Replay')
                ->where('thread.id', $thread->id)
                ->where('run.id', $run->id)
                ->has('events')
                ->has('model'),
        );
    });

    it('includes the synthesized event stream (run.started + tokens + run.completed)', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $run = makeCompleteRun($user, $thread, [
            ['token' => 'Hello', 'index' => 0, 't_ms' => 100, 'logprobs' => null],
            ['token' => ' world', 'index' => 1, 't_ms' => 200, 'logprobs' => null],
        ]);

        $this->actingAs($user)->get(replayUrl($thread, $run))->assertInertia(
            fn ($page) => $page
                // 1 run.started + 2 tokens × 2 events + 1 run.completed = 6
                ->has('events', 6)
                ->where('events.0.event', 'run.started')
                ->where('events.1.event', 'token.received')
                ->where('events.1.payload.token', 'Hello')
                ->where('events.5.event', 'run.completed'),
        );
    });

    it('includes the model snapshot fields the viz expects', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        $run = makeCompleteRun($user, $thread);

        $this->actingAs($user)->get(replayUrl($thread, $run))->assertInertia(
            fn ($page) => $page
                ->where('run.total_layers', 80)
                ->where('run.architecture_type', 'dense')
                ->where('model.context_length', 128000),
        );
    });
});
