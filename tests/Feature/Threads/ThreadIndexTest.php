<?php

use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * GET /threads — list/search/filter (M7 chunk 4). Per-user isolation
 * is the load-bearing invariant; the chunk-3 dashboard tests covered
 * stats isolation, this covers the full thread list surface.
 */

describe('GET /threads — auth', function () {
    it('redirects unauthenticated callers to login', function () {
        $this->get('/threads')->assertRedirect();
    });

    it('renders the Threads/Index Inertia page', function () {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/threads')->assertInertia(
            fn ($page) => $page
                ->component('Threads/Index')
                ->has('threads')
                ->has('filters')
                ->has('available_tags')
        );
    });
});

describe('GET /threads — listing + isolation', function () {
    it('lists the user\'s threads ordered by last_activity_at desc', function () {
        $user = User::factory()->create();
        Thread::factory()->for($user)->create([
            'title' => 'Old thread',
            'last_activity_at' => now()->subDays(2),
        ]);
        Thread::factory()->for($user)->create([
            'title' => 'New thread',
            'last_activity_at' => now()->subMinutes(5),
        ]);

        $this->actingAs($user)->get('/threads')->assertInertia(
            fn ($page) => $page
                ->where('threads.data.0.title', 'New thread')
                ->where('threads.data.1.title', 'Old thread')
        );
    });

    it('does not leak other users\' threads', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        Thread::factory()->for($stranger)->create(['title' => 'STRANGER']);
        Thread::factory()->for($owner)->create(['title' => 'MINE']);

        $this->actingAs($owner)->get('/threads')->assertInertia(
            fn ($page) => $page
                ->has('threads.data', 1)
                ->where('threads.data.0.title', 'MINE')
        );
    });

    it('includes run_count per thread', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        foreach ([1, 2, 3] as $seq) {
            Run::factory()->for($user)->for($thread)
                ->create(['sequence_in_thread' => $seq]);
        }

        $this->actingAs($user)->get('/threads')->assertInertia(
            fn ($page) => $page->where('threads.data.0.run_count', 3)
        );
    });
});

describe('GET /threads — search', function () {
    it('filters by ?q against title (substring, case-insensitive)', function () {
        $user = User::factory()->create();
        Thread::factory()->for($user)->create(['title' => 'Quantum entanglement']);
        Thread::factory()->for($user)->create(['title' => 'Gradient descent']);

        $this->actingAs($user)->get('/threads?q=quant')->assertInertia(
            fn ($page) => $page
                ->has('threads.data', 1)
                ->where('threads.data.0.title', 'Quantum entanglement')
                ->where('filters.q', 'quant')
        );
    });

    it('trims whitespace on the q parameter', function () {
        $user = User::factory()->create();
        Thread::factory()->for($user)->create(['title' => 'Hello world']);

        $this->actingAs($user)->get('/threads?q=' . urlencode('  hello  '))
            ->assertInertia(fn ($page) => $page
                ->has('threads.data', 1)
                ->where('filters.q', 'hello')
            );
    });
});

describe('GET /threads — archive filter', function () {
    it('defaults to active threads only (archived=false)', function () {
        $user = User::factory()->create();
        Thread::factory()->for($user)->create(['title' => 'active']);
        Thread::factory()->for($user)->archived()->create(['title' => 'shelved']);

        $this->actingAs($user)->get('/threads')->assertInertia(
            fn ($page) => $page
                ->has('threads.data', 1)
                ->where('threads.data.0.title', 'active')
                ->where('filters.archived', 'false')
        );
    });

    it('returns only archived when archived=true', function () {
        $user = User::factory()->create();
        Thread::factory()->for($user)->create(['title' => 'active']);
        Thread::factory()->for($user)->archived()->create(['title' => 'shelved']);

        $this->actingAs($user)->get('/threads?archived=true')->assertInertia(
            fn ($page) => $page
                ->has('threads.data', 1)
                ->where('threads.data.0.title', 'shelved')
                ->where('threads.data.0.archived', true)
        );
    });

    it('returns both when archived=all', function () {
        $user = User::factory()->create();
        Thread::factory()->for($user)->create();
        Thread::factory()->for($user)->archived()->create();

        $this->actingAs($user)->get('/threads?archived=all')->assertInertia(
            fn ($page) => $page->has('threads.data', 2)
        );
    });
});

describe('GET /threads — tag filter', function () {
    it('filters threads by tag', function () {
        $user = User::factory()->create();
        Thread::factory()->for($user)->create([
            'title' => 'tagged',
            'tags' => ['research', 'priority'],
        ]);
        Thread::factory()->for($user)->create([
            'title' => 'untagged',
            'tags' => null,
        ]);

        $this->actingAs($user)->get('/threads?tag=research')->assertInertia(
            fn ($page) => $page
                ->has('threads.data', 1)
                ->where('threads.data.0.title', 'tagged')
        );
    });

    it('returns available_tags as a sorted unique list', function () {
        $user = User::factory()->create();
        Thread::factory()->for($user)->create(['tags' => ['zebra', 'apple']]);
        Thread::factory()->for($user)->create(['tags' => ['apple', 'mango']]);

        $this->actingAs($user)->get('/threads')->assertInertia(
            fn ($page) => $page->where('available_tags', ['apple', 'mango', 'zebra'])
        );
    });

    it('does not leak other users\' tags into available_tags', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        Thread::factory()->for($stranger)->create(['tags' => ['SECRET']]);
        Thread::factory()->for($owner)->create(['tags' => ['mine']]);

        $this->actingAs($owner)->get('/threads')->assertInertia(
            fn ($page) => $page->where('available_tags', ['mine'])
        );
    });
});

describe('GET /threads — pagination', function () {
    it('paginates at 20 per page', function () {
        $user = User::factory()->create();
        // Each factory call has a unique last_activity_at to keep ordering predictable.
        for ($i = 0; $i < 25; $i++) {
            Thread::factory()->for($user)->create([
                'title' => "thread {$i}",
                'last_activity_at' => now()->subSeconds($i),
            ]);
        }

        $this->actingAs($user)->get('/threads')->assertInertia(
            fn ($page) => $page
                ->has('threads.data', 20)
                ->where('threads.current_page', 1)
                ->where('threads.last_page', 2)
                ->where('threads.total', 25)
        );
    });

    it('honors the ?page query param', function () {
        $user = User::factory()->create();
        for ($i = 0; $i < 25; $i++) {
            Thread::factory()->for($user)->create([
                'title' => "thread {$i}",
                'last_activity_at' => now()->subSeconds($i),
            ]);
        }

        $this->actingAs($user)->get('/threads?page=2')->assertInertia(
            fn ($page) => $page
                ->has('threads.data', 5)
                ->where('threads.current_page', 2)
        );
    });
});

describe('POST /threads — store', function () {
    it('requires auth', function () {
        $this->post('/threads')->assertRedirect();
    });

    it('creates an empty thread for the user and redirects to its detail page', function () {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/threads');

        $thread = $user->threads()->latest('id')->first();
        expect($thread)->not->toBeNull();
        expect($thread->title)->toBeNull();
        expect($thread->archived)->toBeFalse();
        expect($thread->last_activity_at)->not->toBeNull();

        $response->assertRedirect("/threads/{$thread->id}");
    });
});
