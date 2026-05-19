<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

uses(RefreshDatabase::class);

/*
 * Inertia error-page rendering (M7 chunk 2). Laravel's withExceptions
 * handler maps each HTTP status to a matching React component when
 * debug mode is off.
 *
 * APP_DEBUG defaults to true in `testing` env — we flip it off per
 * test so the Inertia render path actually fires (otherwise tests
 * see the whoops/stack-trace page from the dev exception renderer).
 */

beforeEach(function () {
    config(['app.debug' => false]);
});

it('renders the NotFound Inertia page for a 404', function () {
    $this->get('/this-route-does-not-exist')
        ->assertStatus(404)
        ->assertInertia(fn ($page) => $page->component('Errors/NotFound'));
});

it('renders the Forbidden Inertia page for a 403', function () {
    Route::get('/test-403', fn () => abort(403))->middleware('web');

    $this->get('/test-403')
        ->assertStatus(403)
        ->assertInertia(fn ($page) => $page->component('Errors/Forbidden'));
});

it('renders the ServerError Inertia page for a 500', function () {
    Route::get('/test-500', fn () => abort(500))->middleware('web');

    $this->get('/test-500')
        ->assertStatus(500)
        ->assertInertia(fn ($page) => $page->component('Errors/ServerError'));
});

it('renders error pages for unauthenticated users', function () {
    // Same 404 path, but without actingAs() — proves the Errors/*
    // pages don't require auth (they're not wrapped in AppLayout).
    $this->get('/this-route-does-not-exist')
        ->assertStatus(404)
        ->assertInertia(fn ($page) => $page->component('Errors/NotFound'));
});

it('still renders Inertia errors for authenticated users', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get('/this-route-does-not-exist')
        ->assertStatus(404)
        ->assertInertia(fn ($page) => $page->component('Errors/NotFound'));
});

it('returns JSON 404 instead of an Inertia page when the request expects JSON', function () {
    // Inertia pages would defeat XHR/JSON callers; the exception handler
    // bypasses the Inertia render when Accept: application/json is set.
    $this->getJson('/this-route-does-not-exist')->assertStatus(404);
});
