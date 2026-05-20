<?php

use App\Models\User;

/*
 * GET /about (M11 chunk 4) — public marketing/explainer page that
 * the SharedLayout footer links to. No auth, no rate limit. Just a
 * static Inertia render.
 */

it('renders the about page for anonymous visitors', function () {
    $response = $this->get('/about');

    $response->assertStatus(200);
    $response->assertSee('"component":"About"', escape: false);
});

it('renders the about page for authenticated visitors', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/about');

    $response->assertStatus(200);
    $response->assertSee('"component":"About"', escape: false);
});

it('exposes the about route name', function () {
    expect(route('about'))->toEndWith('/about');
});
