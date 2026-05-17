<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

uses(RefreshDatabase::class);

beforeEach(function () {
    // Register a stub route protected by the `runs` rate limiter so we can
    // exercise the configuration. The real route lands in M5/M6.
    Route::middleware(['web', 'auth', 'throttle:runs'])->get('/test/runs', function () {
        return response()->json(['ok' => true]);
    });
});

it('allows requests under the per-user limit', function () {
    $user = User::factory()->create(['max_runs_per_hour' => 5]);
    $this->actingAs($user);

    for ($i = 0; $i < 5; $i++) {
        $this->get('/test/runs')->assertStatus(200);
    }
});

it('returns 429 when the per-user limit is exceeded', function () {
    $user = User::factory()->create(['max_runs_per_hour' => 3]);
    $this->actingAs($user);

    $this->get('/test/runs')->assertStatus(200);
    $this->get('/test/runs')->assertStatus(200);
    $this->get('/test/runs')->assertStatus(200);
    $this->get('/test/runs')->assertStatus(429);
});

it('exposes X-RateLimit-Limit and X-RateLimit-Remaining headers', function () {
    $user = User::factory()->create(['max_runs_per_hour' => 5]);
    $this->actingAs($user);

    $first = $this->get('/test/runs');
    $first->assertHeader('X-RateLimit-Limit', '5');
    $first->assertHeader('X-RateLimit-Remaining', '4');

    $second = $this->get('/test/runs');
    $second->assertHeader('X-RateLimit-Remaining', '3');
});

it('keeps each user on a separate counter', function () {
    $alice = User::factory()->create(['max_runs_per_hour' => 1]);
    $bob = User::factory()->create(['max_runs_per_hour' => 1]);

    $this->actingAs($alice)->get('/test/runs')->assertStatus(200);
    $this->actingAs($alice)->get('/test/runs')->assertStatus(429);

    // Bob should still have his full budget.
    $this->actingAs($bob)->get('/test/runs')->assertStatus(200);
});

it('reads max_runs_per_hour live so admin edits take effect', function () {
    $user = User::factory()->create(['max_runs_per_hour' => 1]);
    $this->actingAs($user);

    $this->get('/test/runs')->assertStatus(200);
    $this->get('/test/runs')->assertStatus(429);

    // Admin raises the limit. The rate-limiter key is the same hour bucket
    // so the existing counter sticks, but the *limit* should reflect the
    // new ceiling — meaning the next request after the increase fits under
    // the higher cap.
    $user->update(['max_runs_per_hour' => 10]);

    $this->get('/test/runs')->assertStatus(200);
});
