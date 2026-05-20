<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function makeSharedThread(array $userOverrides = [], array $threadOverrides = []): Thread
{
    $user = User::factory()->create($userOverrides);

    return Thread::factory()->for($user)->create(array_merge([
        'share_token' => str_repeat('a', 32),
        'share_enabled_at' => now(),
        'title' => 'Public quantum',
        'tags' => ['research'],
    ], $threadOverrides));
}

describe('GET /share/{token} — token resolution', function () {
    it('returns 404 for a totally unknown token', function () {
        $this->get('/share/' . str_repeat('z', 32))->assertNotFound();
    });

    it('returns 404 when no thread has that token', function () {
        // Pre-populate a thread with a different token so the table
        // is non-empty.
        makeSharedThread([], ['share_token' => str_repeat('a', 32)]);

        $this->get('/share/' . str_repeat('b', 32))->assertNotFound();
    });

    it('serves 200 + Share/Show component for a valid token', function () {
        $thread = makeSharedThread();

        $this->get('/share/' . $thread->share_token)->assertInertia(
            fn ($page) => $page->component('Share/Show')->where('token', $thread->share_token),
        );
    });

    it('returns 404 when share_token is null even if the route shape matches', function () {
        // Defense-in-depth: a thread row with share_token=null should
        // never match the WHERE clause (whereNotNull guard) — even if
        // someone hits /share/ with an empty token, route binding
        // catches it first.
        $thread = makeSharedThread([], ['share_token' => null, 'share_enabled_at' => null]);
        // No token to look up since the thread has none.
        $this->get('/share/' . str_repeat('a', 32))->assertNotFound();
    });
});

describe('GET /share/{token} — response shape', function () {
    it('returns sanitized thread + runs (no user_id / model_id / api_key_id)', function () {
        $user = User::factory()->create(['store_prompts' => true]);
        $thread = Thread::factory()->for($user)->create([
            'share_token' => str_repeat('c', 32),
            'share_enabled_at' => now(),
            'title' => 'Quantum',
        ]);
        Run::factory()->for($user)->for($thread)->create([
            'sequence_in_thread' => 1,
            'status' => RunStatus::Complete,
            'prompt' => 'hi',
            'output_text' => 'hello',
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
        ]);

        $this->get('/share/' . $thread->share_token)->assertInertia(
            fn ($page) => $page
                ->where('thread.id', $thread->id)
                ->where('thread.title', 'Quantum')
                ->has('runs', 1)
                ->where('runs.0.prompt', 'hi')
                ->where('runs.0.output_text', 'hello')
                ->where('runs.0.total_layers', 12)
                ->where('runs.0.architecture_type', 'dense')
                ->missing('runs.0.user_id')
                ->missing('runs.0.model_id'),
        );
    });

    it('redacts null prompts when owner store_prompts=false', function () {
        $user = User::factory()->create(['store_prompts' => false]);
        $thread = Thread::factory()->for($user)->create([
            'share_token' => str_repeat('d', 32),
            'share_enabled_at' => now(),
        ]);
        Run::factory()->for($user)->for($thread)->create([
            'sequence_in_thread' => 1,
            'status' => RunStatus::Complete,
            'prompt' => null, // honoring the privacy opt-out
            'output_text' => 'reply',
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
        ]);

        $this->get('/share/' . $thread->share_token)->assertInertia(
            fn ($page) => $page
                ->where('runs.0.prompt', '[prompt redacted by author]')
                ->where('prompts_redacted', true),
        );
    });

    it('does not redact prompts when owner store_prompts=true (even if the value happens to be null)', function () {
        $user = User::factory()->create(['store_prompts' => true]);
        $thread = Thread::factory()->for($user)->create([
            'share_token' => str_repeat('e', 32),
            'share_enabled_at' => now(),
        ]);
        Run::factory()->for($user)->for($thread)->create([
            'sequence_in_thread' => 1,
            'status' => RunStatus::Complete,
            'prompt' => null,
            'output_text' => 'reply',
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
        ]);

        $this->get('/share/' . $thread->share_token)->assertInertia(
            fn ($page) => $page
                ->where('runs.0.prompt', null)
                ->where('prompts_redacted', false),
        );
    });

    it('orders runs by sequence_in_thread asc', function () {
        $thread = makeSharedThread([], ['share_token' => str_repeat('f', 32)]);
        foreach ([3, 1, 2] as $seq) {
            Run::factory()->for($thread->user)->for($thread)->create([
                'sequence_in_thread' => $seq,
                'status' => RunStatus::Complete,
                'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
            ]);
        }

        $this->get('/share/' . $thread->share_token)->assertInertia(
            fn ($page) => $page
                ->has('runs', 3)
                ->where('runs.0.sequence_in_thread', 1)
                ->where('runs.1.sequence_in_thread', 2)
                ->where('runs.2.sequence_in_thread', 3),
        );
    });

    it('is reachable anonymously (no auth required)', function () {
        $thread = makeSharedThread([], ['share_token' => str_repeat('g', 32)]);

        // No actingAs() call — fully anonymous.
        $this->get('/share/' . $thread->share_token)->assertOk();
    });
});

describe('GET /share/{token} — rate limit', function () {
    it('returns 429 after 60 requests per minute from the same IP', function () {
        $thread = makeSharedThread([], ['share_token' => str_repeat('h', 32)]);

        // First 60 should pass.
        for ($i = 0; $i < 60; $i++) {
            $this->get('/share/' . $thread->share_token)->assertOk();
        }
        // 61st gets throttled.
        $this->get('/share/' . $thread->share_token)->assertStatus(429);
    });
});
