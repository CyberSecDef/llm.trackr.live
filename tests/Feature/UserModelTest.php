<?php

use App\Enums\UserRole;
use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('persists the spec-mandated columns', function () {
    $user = User::factory()->create([
        'name' => 'Ada Lovelace',
        'email' => 'ada@example.com',
        'avatar_url' => 'https://example.com/ada.png',
        'store_prompts' => false,
        'max_runs_per_hour' => 100,
    ]);

    $fresh = User::find($user->id);

    expect($fresh->name)->toBe('Ada Lovelace');
    expect($fresh->email)->toBe('ada@example.com');
    expect($fresh->avatar_url)->toBe('https://example.com/ada.png');
    expect($fresh->store_prompts)->toBeFalse();
    expect($fresh->max_runs_per_hour)->toBe(100);
});

it('defaults role to user and max_runs_per_hour to 30', function () {
    $user = User::factory()->create();

    expect($user->role)->toBe(UserRole::User);
    expect($user->max_runs_per_hour)->toBe(30);
    expect($user->store_prompts)->toBeTrue();
});

it('casts the role column to the UserRole enum', function () {
    $admin = User::factory()->admin()->create();
    $regular = User::factory()->create();

    expect($admin->role)->toBe(UserRole::Admin);
    expect($regular->role)->toBe(UserRole::User);
    expect($admin->isAdmin())->toBeTrue();
    expect($regular->isAdmin())->toBeFalse();
});

it('does not have a password column', function () {
    $user = User::factory()->create();

    expect($user->getAttributes())->not->toHaveKey('password');
});

it('hides remember_token from serialization', function () {
    $user = User::factory()->create();

    expect($user->toArray())->not->toHaveKey('remember_token');
});

it('cascades social account deletion when a user is deleted', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->for($user)->google()->create();
    SocialAccount::factory()->for($user)->microsoft()->create();

    expect($user->socialAccounts)->toHaveCount(2);

    $user->delete();

    expect(SocialAccount::count())->toBe(0);
});

it('enforces unique (provider, provider_user_id) across users', function () {
    $userA = User::factory()->create();
    $userB = User::factory()->create();

    SocialAccount::factory()->for($userA)->create([
        'provider' => 'google',
        'provider_user_id' => 'google-123',
    ]);

    expect(fn () => SocialAccount::factory()->for($userB)->create([
        'provider' => 'google',
        'provider_user_id' => 'google-123',
    ]))->toThrow(UniqueConstraintViolationException::class);
});

it('allows the same provider_user_id across different providers', function () {
    $user = User::factory()->create();

    SocialAccount::factory()->for($user)->create([
        'provider' => 'google',
        'provider_user_id' => 'shared-id-42',
    ]);

    SocialAccount::factory()->for($user)->create([
        'provider' => 'microsoft',
        'provider_user_id' => 'shared-id-42',
    ]);

    expect($user->socialAccounts()->count())->toBe(2);
});
