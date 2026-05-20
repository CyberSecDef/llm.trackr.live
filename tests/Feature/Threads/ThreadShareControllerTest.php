<?php

use App\Models\Thread;
use App\Models\User;
use App\Services\Threads\ShareTokenGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

class FixedTokenGenerator extends ShareTokenGenerator
{
    public int $calls = 0;

    public function __construct(public string $next = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') {}

    public function generate(): string
    {
        $this->calls++;

        // Return a different value each call so regen tests can
        // distinguish first vs second enable.
        return str_pad((string) $this->calls, 32, 'a');
    }
}

describe('POST /threads/{thread}/share — auth', function () {
    it('redirects unauthenticated callers to login', function () {
        $thread = Thread::factory()->create();

        $this->post("/threads/{$thread->id}/share")->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = Thread::factory()->for($owner)->create();

        $this->actingAs($stranger)
            ->post("/threads/{$thread->id}/share")
            ->assertForbidden();
    });
});

describe('POST /threads/{thread}/share — enable', function () {
    it('generates a token + sets share_enabled_at + redirects to the thread page', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create([
            'share_token' => null,
            'share_enabled_at' => null,
        ]);

        $this->actingAs($user)
            ->post("/threads/{$thread->id}/share")
            ->assertRedirect("/threads/{$thread->id}");

        $thread->refresh();
        expect($thread->share_token)->not->toBeNull();
        expect($thread->share_token)->toMatch('/^[0-9a-f]{32}$/');
        expect($thread->share_enabled_at)->not->toBeNull();
    });

    it('always regenerates the token on enable (chunk-1 decision)', function () {
        $generator = new FixedTokenGenerator;
        app()->instance(ShareTokenGenerator::class, $generator);

        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        // First enable.
        $this->actingAs($user)->post("/threads/{$thread->id}/share");
        $firstToken = $thread->fresh()->share_token;

        // Re-enable on a thread that's already shared → fresh token.
        $this->actingAs($user)->post("/threads/{$thread->id}/share");
        $secondToken = $thread->fresh()->share_token;

        expect($firstToken)->not->toBe($secondToken);
        expect($generator->calls)->toBe(2);
    });
});

describe('DELETE /threads/{thread}/share — disable', function () {
    it('redirects unauthenticated callers to login', function () {
        $thread = Thread::factory()->create();

        $this->delete("/threads/{$thread->id}/share")->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = Thread::factory()->for($owner)->create([
            'share_token' => 'sometoken',
            'share_enabled_at' => now(),
        ]);

        $this->actingAs($stranger)
            ->delete("/threads/{$thread->id}/share")
            ->assertForbidden();
    });

    it('nulls share_token + share_enabled_at + redirects', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create([
            'share_token' => str_repeat('a', 32),
            'share_enabled_at' => now(),
        ]);

        $this->actingAs($user)
            ->delete("/threads/{$thread->id}/share")
            ->assertRedirect("/threads/{$thread->id}");

        $thread->refresh();
        expect($thread->share_token)->toBeNull();
        expect($thread->share_enabled_at)->toBeNull();
    });

    it('is idempotent: DELETE on an unshared thread is a no-op redirect, not 404', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create([
            'share_token' => null,
            'share_enabled_at' => null,
        ]);

        $this->actingAs($user)
            ->delete("/threads/{$thread->id}/share")
            ->assertRedirect("/threads/{$thread->id}");

        expect($thread->fresh()->share_token)->toBeNull();
    });
});

describe('share lifecycle — disable then re-enable', function () {
    it('produces a fresh token (no token reuse across disable/enable)', function () {
        $generator = new FixedTokenGenerator;
        app()->instance(ShareTokenGenerator::class, $generator);

        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        // Enable → disable → enable.
        $this->actingAs($user)->post("/threads/{$thread->id}/share");
        $firstToken = $thread->fresh()->share_token;

        $this->actingAs($user)->delete("/threads/{$thread->id}/share");
        expect($thread->fresh()->share_token)->toBeNull();

        $this->actingAs($user)->post("/threads/{$thread->id}/share");
        $secondToken = $thread->fresh()->share_token;

        expect($firstToken)->not->toBe($secondToken);
    });
});
