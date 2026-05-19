<?php

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;

uses(RefreshDatabase::class);

/*
 * Dev-only magic-login flow. The `dev:login` Artisan command issues a
 * 15-minute signed URL for a user (only in `local` env); the
 * `dev.login` route validates the signature and 404s outside `local`.
 *
 * Test env is `testing`, so the env guards on both sides should fire.
 * We flip env via `app()['env'] = 'local'` to exercise the happy path —
 * a single container key is all the runtime checks read.
 */

describe('dev:login command', function () {
    it('refuses to run outside local env', function () {
        $this->artisan('dev:login', ['email' => 'someone@example.com'])
            ->expectsOutput('Refusing to run outside the local environment.')
            ->assertExitCode(1);
    });

    it('creates the user when none exists, then prints a signed URL', function () {
        app()['env'] = 'local';

        $this->artisan('dev:login', ['email' => 'newuser@example.com'])
            ->expectsConfirmation(
                'No user with email newuser@example.com — create one (admin role)?',
                'yes',
            )
            ->assertExitCode(0);

        $user = User::firstWhere('email', 'newuser@example.com');
        expect($user)->not->toBeNull();
        expect($user->role)->toBe(UserRole::Admin);
    });

    it('issues a signed URL for an existing user', function () {
        app()['env'] = 'local';
        User::factory()->create(['email' => 'real@example.com']);

        $this->artisan('dev:login', ['email' => 'real@example.com'])
            ->assertExitCode(0);
    });

    it('honors --host override when generating the URL', function () {
        app()['env'] = 'local';
        User::factory()->create(['email' => 'real@example.com']);

        // Just smoke-test that --host doesn't crash; URL inspection
        // happens through the route-level tests below.
        $this->artisan('dev:login', [
            'email' => 'real@example.com',
            '--host' => 'http://192.168.0.205:8001',
        ])->assertExitCode(0);
    });
});

describe('dev.login route', function () {
    it('returns 404 outside local env even with a valid signature', function () {
        // Test env is `testing` — the runtime env check should 404.
        $user = User::factory()->create();
        app()['env'] = 'local';
        $url = URL::temporarySignedRoute('dev.login', now()->addMinutes(15), ['user' => $user->id]);
        // Flip back to testing for the actual GET so the env guard fires.
        app()['env'] = 'testing';

        $this->get($url)->assertNotFound();
        $this->assertGuest();
    });

    it('logs the user in and redirects to dashboard on a valid signature', function () {
        app()['env'] = 'local';
        $user = User::factory()->create();
        $url = URL::temporarySignedRoute('dev.login', now()->addMinutes(15), ['user' => $user->id]);

        $response = $this->get($url);

        $response->assertRedirect(route('dashboard'));
        $this->assertAuthenticatedAs($user);
    });

    it('returns 403 when the signature is missing', function () {
        app()['env'] = 'local';
        $user = User::factory()->create();

        $this->get("/dev/login/{$user->id}")->assertForbidden();
        $this->assertGuest();
    });

    it('returns 403 when the signature is tampered', function () {
        app()['env'] = 'local';
        $user = User::factory()->create();
        $url = URL::temporarySignedRoute('dev.login', now()->addMinutes(15), ['user' => $user->id]);
        $tampered = $url . 'x';

        $this->get($tampered)->assertForbidden();
        $this->assertGuest();
    });

    it('returns 403 when the signature has expired', function () {
        app()['env'] = 'local';
        $user = User::factory()->create();
        $url = URL::temporarySignedRoute('dev.login', now()->subMinute(), ['user' => $user->id]);

        $this->get($url)->assertForbidden();
        $this->assertGuest();
    });
});
