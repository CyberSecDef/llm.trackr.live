<?php

use App\Models\Run;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * GET /runs/{run}/debug authorization + render contract (M6 chunk 4b).
 */

it('redirects unauthenticated callers to login', function () {
    $run = Run::factory()->create();

    $response = $this->get("/runs/{$run->id}/debug");

    $response->assertRedirect();
});

it('returns 403 when the user does not own the run', function () {
    $owner = User::factory()->create();
    $stranger = User::factory()->create();
    $run = Run::factory()->for($owner)->create();

    $response = $this->actingAs($stranger)->get("/runs/{$run->id}/debug");

    $response->assertForbidden();
});

it('returns 404 for a nonexistent run', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/runs/999999/debug');

    $response->assertNotFound();
});

it('renders the debug Inertia page for the run owner', function () {
    $user = User::factory()->create();
    $run = Run::factory()->for($user)->create();

    $this->actingAs($user)
        ->get("/runs/{$run->id}/debug")
        ->assertInertia(
            fn ($page) => $page
                ->component('Runs/Debug')
                ->where('run.id', $run->id)
                ->where('run.status', $run->status->value)
                ->where('channel', "private-runs.{$run->id}")
        );
});
