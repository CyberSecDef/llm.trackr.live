<?php

use App\Models\ApiKey;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * GET /dashboard (M7 chunk 3) — aggregates the signed-in user's
 * stats and recent threads. Per-user isolation matters: a stranger's
 * runs / threads must never appear in the response.
 */

it('redirects unauthenticated callers to login', function () {
    $this->get('/dashboard')->assertRedirect();
});

it('renders the Dashboard component with the expected props shape', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/dashboard')->assertInertia(
        fn ($page) => $page
            ->component('Dashboard')
            ->has('stats')
            ->has('stats.total_runs')
            ->has('stats.total_tokens')
            ->has('stats.total_cost')
            ->has('recent_threads')
            ->has('has_api_keys')
    );
});

it('aggregates run count, tokens, and cost across the user\'s complete runs', function () {
    $user = User::factory()->create();
    $thread = Thread::factory()->for($user)->create();

    Run::factory()->for($user)->for($thread)->complete()->create([
        'sequence_in_thread' => 1,
        'input_tokens' => 10,
        'output_tokens' => 20,
        'estimated_cost' => 0.0015,
    ]);
    Run::factory()->for($user)->for($thread)->complete()->create([
        'sequence_in_thread' => 2,
        'input_tokens' => 5,
        'output_tokens' => 15,
        'estimated_cost' => 0.0005,
    ]);

    $this->actingAs($user)->get('/dashboard')->assertInertia(
        fn ($page) => $page
            ->where('stats.total_runs', 2)
            ->where('stats.total_tokens', 50) // (10+20) + (5+15)
            ->where('stats.total_cost', 0.002)
    );
});

it('counts errored / streaming / pending runs toward total_runs but excludes them from tokens + cost', function () {
    $user = User::factory()->create();
    $thread = Thread::factory()->for($user)->create();

    Run::factory()->for($user)->for($thread)->complete()->create([
        'sequence_in_thread' => 1,
        'input_tokens' => 10,
        'output_tokens' => 20,
        'estimated_cost' => 0.001,
    ]);
    Run::factory()->for($user)->for($thread)->errored('boom')->create([
        'sequence_in_thread' => 2,
        'input_tokens' => 5,
        'output_tokens' => 0,
        'estimated_cost' => null,
    ]);
    Run::factory()->for($user)->for($thread)->streaming()->create([
        'sequence_in_thread' => 3,
    ]);

    $this->actingAs($user)->get('/dashboard')->assertInertia(
        fn ($page) => $page
            ->where('stats.total_runs', 3)
            ->where('stats.total_tokens', 30)
            ->where('stats.total_cost', 0.001)
    );
});

it('isolates stats per user — does not leak another user\'s data', function () {
    $owner = User::factory()->create();
    $stranger = User::factory()->create();
    $strangerThread = Thread::factory()->for($stranger)->create();
    Run::factory()->for($stranger)->for($strangerThread)->complete()->create([
        'input_tokens' => 1_000,
        'output_tokens' => 1_000,
        'estimated_cost' => 100.0,
    ]);

    $this->actingAs($owner)->get('/dashboard')->assertInertia(
        fn ($page) => $page
            ->where('stats.total_runs', 0)
            ->where('stats.total_tokens', 0)
            // JSON has no float-vs-int distinction; PHP encodes 0.0 as "0",
            // so the round-tripped value comes back as int across the wire.
            ->where('stats.total_cost', 0)
    );
});

it('returns up to 5 recent threads ordered by last_activity_at desc', function () {
    $user = User::factory()->create();

    // 7 threads with descending activity timestamps.
    foreach (range(1, 7) as $i) {
        Thread::factory()->for($user)->create([
            'title' => "Thread {$i}",
            'last_activity_at' => now()->subMinutes($i),
        ]);
    }

    $this->actingAs($user)->get('/dashboard')->assertInertia(
        fn ($page) => $page
            ->has('recent_threads', 5)
            ->where('recent_threads.0.title', 'Thread 1')
            ->where('recent_threads.4.title', 'Thread 5')
    );
});

it('includes a run_count per thread in the recent list', function () {
    $user = User::factory()->create();
    $thread = Thread::factory()->for($user)->create();
    foreach ([1, 2, 3] as $seq) {
        Run::factory()->for($user)->for($thread)->create(['sequence_in_thread' => $seq]);
    }

    $this->actingAs($user)->get('/dashboard')->assertInertia(
        fn ($page) => $page->where('recent_threads.0.run_count', 3)
    );
});

it('does not leak threads from other users in recent_threads', function () {
    $owner = User::factory()->create();
    $stranger = User::factory()->create();
    Thread::factory()->for($stranger)->create(['title' => 'STRANGER']);
    Thread::factory()->for($owner)->create(['title' => 'MINE']);

    $this->actingAs($owner)->get('/dashboard')->assertInertia(
        fn ($page) => $page
            ->has('recent_threads', 1)
            ->where('recent_threads.0.title', 'MINE')
    );
});

it('reports has_api_keys=false when the user has none', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/dashboard')->assertInertia(
        fn ($page) => $page->where('has_api_keys', false)
    );
});

it('reports has_api_keys=true when the user has at least one', function () {
    $user = User::factory()->create();
    ApiKey::factory()->for($user)->create();

    $this->actingAs($user)->get('/dashboard')->assertInertia(
        fn ($page) => $page->where('has_api_keys', true)
    );
});
