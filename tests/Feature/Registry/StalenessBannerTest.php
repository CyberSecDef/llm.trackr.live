<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\RegistryMeta;
use App\Models\User;
use App\Services\ModelRegistry\RefreshService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

it('marks the registry stale when never refreshed', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/dashboard');

    $response->assertSee('"is_stale":true', escape: false);
    $response->assertSee('"days_stale":null', escape: false);
    $response->assertSee('"last_refresh_at":null', escape: false);
});

it('marks the registry fresh when refreshed within the threshold', function () {
    RegistryMeta::setValue(RefreshService::META_LAST_SUCCESSFUL_REFRESH, [
        'at' => Carbon::now()->subDays(3)->toIso8601String(),
    ]);

    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/dashboard');

    $response->assertSee('"is_stale":false', escape: false);
});

it('marks the registry stale at exactly the threshold', function () {
    expect(HandleInertiaRequests::STALENESS_THRESHOLD_DAYS)->toBe(14);

    RegistryMeta::setValue(RefreshService::META_LAST_SUCCESSFUL_REFRESH, [
        'at' => Carbon::now()->subDays(14)->toIso8601String(),
    ]);

    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/dashboard');

    $response->assertSee('"is_stale":true', escape: false);
    $response->assertSee('"days_stale":14', escape: false);
});

it('marks the registry stale well past the threshold', function () {
    RegistryMeta::setValue(RefreshService::META_LAST_SUCCESSFUL_REFRESH, [
        'at' => Carbon::now()->subDays(30)->toIso8601String(),
    ]);

    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/dashboard');

    $response->assertSee('"is_stale":true', escape: false);
    $response->assertSee('"days_stale":30', escape: false);
});

it('exposes the registry state on every authenticated page', function () {
    RegistryMeta::setValue(RefreshService::META_LAST_SUCCESSFUL_REFRESH, [
        'at' => Carbon::now()->subDays(2)->toIso8601String(),
    ]);

    $user = User::factory()->create();

    foreach (['/dashboard', '/settings', '/threads', '/models', '/api-keys'] as $path) {
        $this->actingAs($user)
            ->get($path)
            ->assertSee('"is_stale":false', escape: false);
    }
});

it('handles a malformed registry_meta value gracefully', function () {
    // Simulate a corrupted meta row — no `at` key. The middleware should
    // treat this as "never refreshed" rather than crashing.
    RegistryMeta::setValue(RefreshService::META_LAST_SUCCESSFUL_REFRESH, [
        'garbage' => 'value',
    ]);

    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/dashboard');

    $response->assertStatus(200);
    $response->assertSee('"is_stale":true', escape: false);
    $response->assertSee('"last_refresh_at":null', escape: false);
});
