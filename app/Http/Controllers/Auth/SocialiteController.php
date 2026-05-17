<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;
use Throwable;

class SocialiteController extends Controller
{
    private const SUPPORTED_PROVIDERS = ['google', 'microsoft', 'facebook'];

    public function redirect(string $provider): SymfonyRedirectResponse
    {
        abort_unless(in_array($provider, self::SUPPORTED_PROVIDERS, true), 404);

        return Socialite::driver($provider)->redirect();
    }

    public function callback(string $provider): RedirectResponse
    {
        abort_unless(in_array($provider, self::SUPPORTED_PROVIDERS, true), 404);

        try {
            $socialiteUser = Socialite::driver($provider)->user();
        } catch (Throwable $e) {
            return redirect()->route('login')->withErrors([
                'social' => "Sign-in via {$provider} failed. Please try again.",
            ]);
        }

        $user = $this->resolveUser($provider, $socialiteUser);

        Auth::login($user, remember: true);

        return redirect()->intended(route('dashboard'));
    }

    public function logout(): RedirectResponse
    {
        Auth::logout();
        request()->session()->invalidate();
        request()->session()->regenerateToken();

        return redirect()->route('home');
    }

    /**
     * Resolve a User from a Socialite OAuth callback, creating or
     * linking as needed.
     *
     * Resolution order (SPEC §3.2.4 + email auto-link decision 2026-05-17):
     *   1. social_accounts row matches (provider, provider_user_id) → log in to that user.
     *   2. users.email matches the OAuth-provided email → log in to that user,
     *      attach a new social_accounts row (auto-link by provider-verified email).
     *   3. Otherwise → create user + social_accounts row.
     */
    private function resolveUser(string $provider, SocialiteUser $socialiteUser): User
    {
        return DB::transaction(function () use ($provider, $socialiteUser) {
            $providerId = (string) $socialiteUser->getId();
            $email = $socialiteUser->getEmail();
            $name = $socialiteUser->getName() ?: $socialiteUser->getNickname();
            $avatar = $socialiteUser->getAvatar();

            $existingLink = SocialAccount::where('provider', $provider)
                ->where('provider_user_id', $providerId)
                ->first();

            if ($existingLink) {
                return $existingLink->user;
            }

            $user = $email ? User::where('email', $email)->first() : null;

            if (! $user) {
                $user = User::create([
                    'email' => $email,
                    'name' => $name,
                    'avatar_url' => $avatar,
                    'email_verified_at' => now(),
                ]);
            } elseif (! $user->avatar_url && $avatar) {
                // Backfill avatar on first link from a provider that supplies one.
                $user->forceFill(['avatar_url' => $avatar])->save();
            }

            SocialAccount::create([
                'user_id' => $user->id,
                'provider' => $provider,
                'provider_user_id' => $providerId,
            ]);

            return $user;
        });
    }
}
