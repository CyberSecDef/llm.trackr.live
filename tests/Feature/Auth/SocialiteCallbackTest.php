<?php

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;

uses(RefreshDatabase::class);

/**
 * Fake-mock a Socialite user for a given provider.
 */
function mockSocialiteCallback(string $provider, array $userData): void
{
    $socialiteUser = Mockery::mock(SocialiteUser::class);
    $socialiteUser->shouldReceive('getId')->andReturn($userData['id']);
    $socialiteUser->shouldReceive('getName')->andReturn($userData['name'] ?? null);
    $socialiteUser->shouldReceive('getNickname')->andReturn($userData['nickname'] ?? null);
    $socialiteUser->shouldReceive('getEmail')->andReturn($userData['email'] ?? null);
    $socialiteUser->shouldReceive('getAvatar')->andReturn($userData['avatar'] ?? null);

    $providerMock = Mockery::mock(Provider::class);
    $providerMock->shouldReceive('user')->andReturn($socialiteUser);

    Socialite::shouldReceive('driver')->with($provider)->andReturn($providerMock);
}

it('rejects an unsupported provider on redirect', function () {
    $this->get('/auth/twitter/redirect')->assertNotFound();
});

it('rejects an unsupported provider on callback', function () {
    $this->get('/auth/twitter/callback')->assertNotFound();
});

it('creates a new user and social_account on first successful callback', function () {
    mockSocialiteCallback('google', [
        'id' => 'google-12345',
        'name' => 'Ada Lovelace',
        'email' => 'ada@example.com',
        'avatar' => 'https://example.com/ada.png',
    ]);

    $response = $this->get('/auth/google/callback');

    $response->assertRedirect(route('dashboard'));
    $this->assertAuthenticated();

    $user = User::where('email', 'ada@example.com')->first();
    expect($user)->not->toBeNull();
    expect($user->name)->toBe('Ada Lovelace');
    expect($user->avatar_url)->toBe('https://example.com/ada.png');
    expect($user->email_verified_at)->not->toBeNull();

    expect($user->socialAccounts)->toHaveCount(1);
    expect($user->socialAccounts->first()->provider)->toBe('google');
    expect($user->socialAccounts->first()->provider_user_id)->toBe('google-12345');
});

it('logs in to an existing user when the social_account is already linked', function () {
    $user = User::factory()->create(['email' => 'ada@example.com']);
    SocialAccount::factory()->for($user)->create([
        'provider' => 'google',
        'provider_user_id' => 'google-12345',
    ]);

    mockSocialiteCallback('google', [
        'id' => 'google-12345',
        'name' => 'Ada Lovelace',
        'email' => 'ada@example.com',
    ]);

    $response = $this->get('/auth/google/callback');

    $response->assertRedirect(route('dashboard'));
    $this->assertAuthenticatedAs($user);
    expect(User::count())->toBe(1);
    expect(SocialAccount::count())->toBe(1);
});

it('auto-links a new social_account when the email matches an existing user', function () {
    $user = User::factory()->create(['email' => 'ada@example.com', 'name' => 'Ada']);
    SocialAccount::factory()->for($user)->create([
        'provider' => 'google',
        'provider_user_id' => 'google-12345',
    ]);

    mockSocialiteCallback('microsoft', [
        'id' => 'microsoft-67890',
        'name' => 'Ada Lovelace',
        'email' => 'ada@example.com',
        'avatar' => 'https://example.com/ada-microsoft.png',
    ]);

    $response = $this->get('/auth/microsoft/callback');

    $response->assertRedirect(route('dashboard'));
    $this->assertAuthenticatedAs($user);

    // Still one user, but now two social accounts.
    expect(User::count())->toBe(1);
    expect($user->fresh()->socialAccounts)->toHaveCount(2);

    $providers = $user->fresh()->socialAccounts->pluck('provider')->all();
    expect($providers)->toContain('google');
    expect($providers)->toContain('microsoft');
});

it('backfills avatar_url from a linking provider when the user has none', function () {
    $user = User::factory()->create([
        'email' => 'ada@example.com',
        'avatar_url' => null,
    ]);

    mockSocialiteCallback('google', [
        'id' => 'google-new',
        'name' => 'Ada',
        'email' => 'ada@example.com',
        'avatar' => 'https://example.com/from-google.png',
    ]);

    $this->get('/auth/google/callback');

    expect($user->fresh()->avatar_url)->toBe('https://example.com/from-google.png');
});

it('does not overwrite an existing avatar when linking another provider', function () {
    $user = User::factory()->create([
        'email' => 'ada@example.com',
        'avatar_url' => 'https://example.com/original.png',
    ]);

    mockSocialiteCallback('google', [
        'id' => 'google-new',
        'name' => 'Ada',
        'email' => 'ada@example.com',
        'avatar' => 'https://example.com/from-google.png',
    ]);

    $this->get('/auth/google/callback');

    expect($user->fresh()->avatar_url)->toBe('https://example.com/original.png');
});

it('logs an authenticated user out via POST /logout', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->post('/logout');

    $response->assertRedirect(route('home'));
    $this->assertGuest();
});

it('blocks unauthenticated requests to /dashboard', function () {
    $response = $this->get('/dashboard');

    $response->assertRedirect('/login');
});

it('blocks unauthenticated POST /logout', function () {
    $response = $this->post('/logout');

    $response->assertRedirect('/login');
});
