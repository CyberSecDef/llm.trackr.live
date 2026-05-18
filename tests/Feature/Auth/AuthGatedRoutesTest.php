<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('redirects an authenticated user away from / to /dashboard', function () {
    $this->actingAs(User::factory()->create())
        ->get('/')
        ->assertRedirect(route('dashboard'));
});

it('redirects an authenticated user away from /login to /dashboard', function () {
    $this->actingAs(User::factory()->create())
        ->get('/login')
        ->assertRedirect(route('dashboard'));
});

it('renders the Welcome page for a guest at /', function () {
    $response = $this->get('/');

    $response->assertStatus(200);
    $response->assertSee('"component":"Welcome"', escape: false);
});

it('renders the Login page for a guest at /login', function () {
    $response = $this->get('/login');

    $response->assertStatus(200);
    $response->assertSee('"component":"Login"', escape: false);
});

it('renders the Dashboard for an authenticated user', function () {
    $this->actingAs(User::factory()->create())
        ->get('/dashboard')
        ->assertStatus(200)
        ->assertSee('"component":"Dashboard"', escape: false);
});

it('renders the Threads placeholder', function () {
    $this->actingAs(User::factory()->create())
        ->get('/threads')
        ->assertStatus(200)
        ->assertSee('"component":"ComingSoon"', escape: false)
        ->assertSee('"feature":"Threads"', escape: false)
        ->assertSee('"milestone":"M5"', escape: false);
});

it('renders the Models placeholder', function () {
    $this->actingAs(User::factory()->create())
        ->get('/models')
        ->assertStatus(200)
        ->assertSee('"feature":"Models"', escape: false);
});

it('renders the API Keys index page (no longer a placeholder after M4 chunk 1)', function () {
    $this->actingAs(User::factory()->create())
        ->get('/api-keys')
        ->assertStatus(200)
        ->assertSee('"component":"ApiKeys\/Index"', escape: false);
});

it('renders the Settings placeholder', function () {
    $this->actingAs(User::factory()->create())
        ->get('/settings')
        ->assertStatus(200)
        ->assertSee('"component":"Settings"', escape: false);
});

it('returns 403 when a non-admin hits /admin/users', function () {
    $this->actingAs(User::factory()->create())
        ->get('/admin/users')
        ->assertForbidden();
});

it('renders the Admin Users page for an admin', function () {
    $this->actingAs(User::factory()->admin()->create())
        ->get('/admin/users')
        ->assertStatus(200)
        ->assertSee('"component":"Admin\/Users"', escape: false);
});

it('shares the authenticated user via Inertia auth.user', function () {
    $user = User::factory()->create([
        'name' => 'Test User',
        'email' => 'test@example.com',
    ]);

    $response = $this->actingAs($user)->get('/dashboard');

    $response->assertStatus(200);
    $response->assertSee('"name":"Test User"', escape: false);
    $response->assertSee('"email":"test@example.com"', escape: false);
    $response->assertSee('"role":"user"', escape: false);
});

it('exposes role admin for admin users via auth.user', function () {
    $admin = User::factory()->admin()->create();

    $this->actingAs($admin)
        ->get('/dashboard')
        ->assertSee('"role":"admin"', escape: false);
});
