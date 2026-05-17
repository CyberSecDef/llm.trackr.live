<?php

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('promotes a regular user to admin', function () {
    $user = User::factory()->create([
        'email' => 'ada@example.com',
        'role' => UserRole::User,
    ]);

    $this->artisan('user:promote', ['email' => 'ada@example.com'])
        ->expectsOutputToContain('Promoted ada@example.com to admin.')
        ->assertSuccessful();

    expect($user->fresh()->role)->toBe(UserRole::Admin);
});

it('is idempotent when the user is already an admin', function () {
    $user = User::factory()->admin()->create(['email' => 'admin@example.com']);

    $this->artisan('user:promote', ['email' => 'admin@example.com'])
        ->expectsOutputToContain('already an admin')
        ->assertSuccessful();

    expect($user->fresh()->role)->toBe(UserRole::Admin);
});

it('fails with a non-zero exit code when no user matches the email', function () {
    $this->artisan('user:promote', ['email' => 'nobody@example.com'])
        ->expectsOutputToContain('No user found with email: nobody@example.com')
        ->assertFailed();
});
