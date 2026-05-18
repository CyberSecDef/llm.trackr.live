<?php

namespace App\Providers;

use App\Services\Llm\Clients\OpenAiClient;
use App\Services\Llm\LlmClientFactory;
use App\Services\Llm\TokenCounter\TokenCounterFactory;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use SocialiteProviders\Manager\SocialiteWasCalled;
use SocialiteProviders\Microsoft\MicrosoftExtendSocialite;
use Yethee\Tiktoken\EncoderProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Singleton so any vendor-client registration applies app-wide,
        // and tests can swap implementations via the same instance.
        // Concrete clients are registered as they land in M4 chunks 3-5.
        $this->app->singleton(LlmClientFactory::class);

        // tiktoken's BPE merge tables are large; share one provider
        // across all OpenAiTokenCounter instances.
        $this->app->singleton(EncoderProvider::class);

        // Convenience singleton so callers can just type-hint the factory.
        $this->app->singleton(TokenCounterFactory::class);
    }

    public function boot(): void
    {
        // socialiteproviders/microsoft registers itself via this event.
        // Google and Facebook are built into laravel/socialite directly.
        Event::listen(SocialiteWasCalled::class, [MicrosoftExtendSocialite::class, 'handle']);

        // Register concrete vendor clients with the factory. Chunks 4-5
        // add the other 8 vendors alongside.
        $factory = $this->app->make(LlmClientFactory::class);
        $factory->register($this->app->make(OpenAiClient::class));

        // Per-user, per-hour rate limit for run submissions.
        // Reads users.max_runs_per_hour live so admin edits take effect on the
        // next request. Applied via `middleware('throttle:runs')` in routes;
        // the run-submission endpoint lands in M5/M6.
        // Laravel's RateLimiter sets X-RateLimit-Limit and X-RateLimit-Remaining
        // headers automatically.
        RateLimiter::for('runs', function (Request $request) {
            $user = $request->user();

            // Unauthenticated callers shouldn't reach a run endpoint — but if
            // they do, fall back to a conservative IP-keyed default.
            if (! $user) {
                return Limit::perHour(10)->by($request->ip());
            }

            return Limit::perHour((int) $user->max_runs_per_hour)->by('runs:' . $user->id);
        });
    }
}
