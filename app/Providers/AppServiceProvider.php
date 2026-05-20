<?php

namespace App\Providers;

use App\Services\Exports\ChromiumDetector;
use App\Services\Exports\FfmpegEncoder;
use App\Services\Exports\FrameRenderer;
use App\Services\Exports\GifRenderer;
use App\Services\Exports\GifRendererFactory;
use App\Services\Exports\SvgFrameRenderer;
use App\Services\Exports\VideoEncoder;
use App\Services\Llm\Clients\AnthropicClient;
use App\Services\Llm\Clients\GoogleGeminiClient;
use App\Services\Llm\Clients\GroqClient;
use App\Services\Llm\Clients\HuggingFaceClient;
use App\Services\Llm\Clients\MetaViaTogetherClient;
use App\Services\Llm\Clients\MistralClient;
use App\Services\Llm\Clients\OpenAiClient;
use App\Services\Llm\Clients\TogetherClient;
use App\Services\Llm\Clients\XaiClient;
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

        // M10 chunk 1: GIF/MP4 renderer binding. Consumers (the
        // ExportRunGif job, test code) type-hint the interface and
        // get the active concrete per `gif_export.renderer` config.
        // Tests can override via `app()->instance(GifRenderer::class, $fake)`
        // — used by the chunk-6 fallback path test and any future
        // job-level integration coverage.
        $this->app->singleton(GifRendererFactory::class);
        $this->app->bind(
            GifRenderer::class,
            fn ($app) => $app->make(GifRendererFactory::class)->make(),
        );

        // M10 chunk 2: FrameRenderer + VideoEncoder default bindings.
        // SvgRenderer asks for these via DI; chunk 4 adds a Puppeteer
        // FrameRenderer; chunk 6's fallback swaps based on Chromium
        // availability at boot.
        $this->app->bind(FrameRenderer::class, SvgFrameRenderer::class);
        // M10 chunk 3: FfmpegEncoder is now the default; the
        // chunk-2 NullVideoEncoder stays in the codebase as the
        // operator-error fallback (chunk 6 will use it when ffmpeg
        // isn't on PATH).
        $this->app->bind(VideoEncoder::class, FfmpegEncoder::class);

        // M10 chunk 4: ChromiumDetector is a singleton so the
        // boot-time binary check runs once. PuppeteerFrameRenderer
        // pulls it via DI for the fallback-detection path.
        $this->app->singleton(ChromiumDetector::class);
    }

    public function boot(): void
    {
        // socialiteproviders/microsoft registers itself via this event.
        // Google and Facebook are built into laravel/socialite directly.
        Event::listen(SocialiteWasCalled::class, [MicrosoftExtendSocialite::class, 'handle']);

        // Register concrete vendor clients with the factory. All 9
        // vendors land here as of M4 chunk 5: OpenAI + the 4 OpenAI-
        // compatible (xAI/Mistral/Groq/Together) + the 3 vendor-
        // specific protocols (Anthropic/Google/HuggingFace) + the
        // Meta-via-Together wrapper.
        $factory = $this->app->make(LlmClientFactory::class);
        $factory->register($this->app->make(OpenAiClient::class));
        $factory->register($this->app->make(XaiClient::class));
        $factory->register($this->app->make(MistralClient::class));
        $factory->register($this->app->make(GroqClient::class));
        $factory->register($this->app->make(TogetherClient::class));
        $factory->register($this->app->make(AnthropicClient::class));
        $factory->register($this->app->make(GoogleGeminiClient::class));
        $factory->register($this->app->make(HuggingFaceClient::class));
        $factory->register($this->app->make(MetaViaTogetherClient::class));

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
