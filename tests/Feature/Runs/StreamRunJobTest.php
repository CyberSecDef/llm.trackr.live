<?php

use App\Enums\RunStatus;
use App\Events\Runs\LayerAdvanced;
use App\Events\Runs\MoeRouted;
use App\Events\Runs\RunCompleted;
use App\Events\Runs\RunErrored;
use App\Events\Runs\RunStarted;
use App\Events\Runs\TokenReceived;
use App\Jobs\StreamRunJob;
use App\Models\ApiKey;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use App\Services\Llm\Contracts\LlmClientInterface;
use App\Services\Llm\Exceptions\InvalidApiKeyException;
use App\Services\Llm\Exceptions\VendorRateLimitedException;
use App\Services\Llm\LlmClientFactory;
use App\Services\Llm\LlmCompletion;
use App\Services\Llm\LlmTokenChunk;
use App\Services\Llm\LlmUsage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

/**
 * Test-only LlmClientInterface that yields a pre-baked sequence of
 * chunks and optionally throws after exhausting them. Stateless per
 * call; safe to register in the LlmClientFactory for the duration of
 * a test.
 *
 * @phpstan-ignore-next-line — anonymous helper class lives here so each
 * test can compose chunks without a verbose mock-builder setup.
 */
final class FakeStreamingClient implements LlmClientInterface
{
    /**
     * @param  list<LlmTokenChunk>  $chunks
     */
    public function __construct(
        private readonly string $vendor,
        private readonly array $chunks = [],
        private readonly ?Throwable $throwAfter = null,
    ) {}

    public function stream(
        ApiKey $apiKey,
        string $model,
        string $prompt,
        array $params,
        array $history = [],
    ): Generator {
        foreach ($this->chunks as $chunk) {
            yield $chunk;
        }
        if ($this->throwAfter !== null) {
            throw $this->throwAfter;
        }
    }

    public function complete(
        ApiKey $apiKey,
        string $model,
        string $prompt,
        array $params,
        array $history = [],
    ): LlmCompletion {
        // Not exercised by StreamRunJob — kept defensive.
        return new LlmCompletion(text: '', usage: new LlmUsage(0, 0));
    }

    public function vendor(): string
    {
        return $this->vendor;
    }
}

/**
 * Set up a Pending Run with the right user/model/api-key triple,
 * register a fake client for that vendor, and return the Run.
 *
 * @param  list<LlmTokenChunk>  $chunks
 */
function pendingRunWithClient(
    array $chunks,
    ?Throwable $throwAfter = null,
    string $vendor = 'openai',
    ?LlmModel $model = null,
): Run {
    $user = User::factory()->create();
    ApiKey::factory()->for($user)->vendor($vendor)->create();
    $model ??= LlmModel::factory()->vendor($vendor)->create();
    $thread = Thread::factory()->for($user)->create();

    $run = Run::factory()
        ->for($user)
        ->for($thread)
        ->for($model, 'model')
        ->create([
            'parameters' => [
                'model_snapshot' => [
                    'architecture_type' => $model->architecture_type?->value,
                    'layers' => $model->layers,
                    'moe_experts' => $model->moe_experts,
                    'moe_active_experts' => $model->moe_active_experts,
                    'pricing_input_per_million' => $model->pricing_input_per_million,
                    'pricing_output_per_million' => $model->pricing_output_per_million,
                ],
            ],
        ]);

    app(LlmClientFactory::class)->register(new FakeStreamingClient($vendor, $chunks, $throwAfter));

    return $run;
}

describe('StreamRunJob — happy path', function () {
    it('flips Pending → Streaming → Complete and persists token_log + output_text', function () {
        $chunks = [
            new LlmTokenChunk(text: 'Hello'),
            new LlmTokenChunk(text: ' world'),
            new LlmTokenChunk(text: '!', isFinal: true, usage: ['input_tokens' => 4, 'output_tokens' => 3]),
        ];
        $run = pendingRunWithClient($chunks);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Complete);
        expect($run->output_text)->toBe('Hello world!');
        expect($run->token_log)->toHaveCount(3);
        expect($run->token_log[0]['token'])->toBe('Hello');
        expect($run->token_log[0]['index'])->toBe(0);
        expect($run->token_log[2]['token'])->toBe('!');
        expect($run->input_tokens)->toBe(4);
        expect($run->output_tokens)->toBe(3);
        expect($run->error_message)->toBeNull();
    });

    it('dispatches RunStarted, per-token events, and RunCompleted in order', function () {
        $chunks = [
            new LlmTokenChunk(text: 'A'),
            new LlmTokenChunk(text: 'B'),
        ];
        $run = pendingRunWithClient($chunks);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));

        Event::assertDispatched(RunStarted::class, fn ($e) => $e->run->id === $run->id);
        Event::assertDispatchedTimes(TokenReceived::class, 2);
        Event::assertDispatchedTimes(LayerAdvanced::class, 2);
        Event::assertDispatched(RunCompleted::class, fn ($e) => $e->run->id === $run->id);
        Event::assertNotDispatched(RunErrored::class);
        Event::assertNotDispatched(MoeRouted::class);
    });

    it('emits MoeRouted per token for MoE models', function () {
        $model = LlmModel::factory()->vendor('openai')->moe(experts: 8, activeExperts: 2)->create();
        $chunks = [
            new LlmTokenChunk(text: 'x'),
            new LlmTokenChunk(text: 'y'),
            new LlmTokenChunk(text: 'z'),
        ];
        $run = pendingRunWithClient($chunks, model: $model);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));

        Event::assertDispatchedTimes(MoeRouted::class, 3);
    });

    it('computes duration_ms and tokens_per_second on completion', function () {
        $chunks = [
            new LlmTokenChunk(text: 'a'),
            new LlmTokenChunk(text: 'b', usage: ['input_tokens' => 2, 'output_tokens' => 2]),
        ];
        $run = pendingRunWithClient($chunks);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->duration_ms)->toBeGreaterThanOrEqual(0);
        expect($run->tokens_per_second)->toBeFloat();
    });

    it('persists null estimated_cost when the snapshot lacks pricing', function () {
        $user = User::factory()->create();
        ApiKey::factory()->for($user)->vendor('openai')->create();
        $model = LlmModel::factory()->vendor('openai')->create();
        $thread = Thread::factory()->for($user)->create();
        $run = Run::factory()
            ->for($user)->for($thread)->for($model, 'model')
            ->create(['parameters' => ['model_snapshot' => ['layers' => 32]]]);
        app(LlmClientFactory::class)->register(new FakeStreamingClient('openai', [
            new LlmTokenChunk(text: 'a', usage: ['input_tokens' => 1, 'output_tokens' => 1]),
        ]));

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->estimated_cost)->toBeNull();
    });

    it('computes estimated_cost from snapshot pricing', function () {
        // $2.50/M input, $10.00/M output → 1,000,000 in + 100,000 out = $2.50 + $1.00 = $3.50
        $chunks = [
            new LlmTokenChunk(text: 'a', usage: ['input_tokens' => 1_000_000, 'output_tokens' => 100_000]),
        ];
        $run = pendingRunWithClient($chunks);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->estimated_cost)->toBe(3.5);
    });

    it('falls back to chunk count for output_tokens when vendor omits usage', function () {
        $chunks = [
            new LlmTokenChunk(text: 'a'),
            new LlmTokenChunk(text: 'b'),
            new LlmTokenChunk(text: 'c'),
        ];
        $run = pendingRunWithClient($chunks);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->output_tokens)->toBe(3);
        expect($run->input_tokens)->toBe(0);
    });

    it('records t_ms in each token_log entry', function () {
        $chunks = [new LlmTokenChunk(text: 'a'), new LlmTokenChunk(text: 'b')];
        $run = pendingRunWithClient($chunks);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->token_log[0])->toHaveKey('t_ms');
        expect($run->token_log[0]['t_ms'])->toBeInt();
    });

    it('preserves logprobs in token_log when vendor exposes them', function () {
        $chunks = [
            new LlmTokenChunk(
                text: 'a',
                logprobs: [['token' => 'a', 'logprob' => -0.5]],
            ),
        ];
        $run = pendingRunWithClient($chunks);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->token_log[0]['logprobs'])->toBe([['token' => 'a', 'logprob' => -0.5]]);
    });

    it('touches the api key last_used_at on successful stream', function () {
        $chunks = [new LlmTokenChunk(text: 'a')];
        $run = pendingRunWithClient($chunks);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));

        $key = ApiKey::where('user_id', $run->user_id)->first();
        expect($key->last_used_at)->not->toBeNull();
    });

    it('writes token_log incrementally between chunks (for SSE catch-up)', function () {
        // Use a custom client that captures the run's DB state after
        // each yield — that's how we prove the incremental UPDATE
        // happens mid-stream, not just at terminal.
        $user = User::factory()->create();
        ApiKey::factory()->for($user)->vendor('openai')->create();
        $model = LlmModel::factory()->vendor('openai')->create();
        $thread = Thread::factory()->for($user)->create();
        $run = Run::factory()->for($user)->for($thread)->for($model, 'model')->create([
            'parameters' => ['model_snapshot' => ['layers' => 32]],
        ]);

        $snapshots = [];
        $observerClient = new class($run, $snapshots) implements LlmClientInterface
        {
            /** @param list<array{count: int, last_token: ?string}> $snapshots */
            public function __construct(public Run $run, public array &$snapshots) {}

            public function stream($apiKey, $model, $prompt, $params, $history = []): Generator
            {
                foreach (['first', ' second', ' third'] as $text) {
                    yield new LlmTokenChunk(text: $text);
                    $this->run->refresh();
                    $this->snapshots[] = [
                        'count' => count($this->run->token_log ?? []),
                        'last_token' => $this->run->token_log[count($this->run->token_log) - 1]['token'] ?? null,
                    ];
                }
            }

            public function complete($apiKey, $model, $prompt, $params, $history = []): LlmCompletion
            {
                return new LlmCompletion(text: '', usage: new LlmUsage(0, 0));
            }

            public function vendor(): string
            {
                return 'openai';
            }
        };
        app(LlmClientFactory::class)->register($observerClient);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));

        expect($snapshots)->toHaveCount(3);
        expect($snapshots[0]['count'])->toBe(1);
        expect($snapshots[0]['last_token'])->toBe('first');
        expect($snapshots[1]['count'])->toBe(2);
        expect($snapshots[1]['last_token'])->toBe(' second');
        expect($snapshots[2]['count'])->toBe(3);
    });
});

describe('StreamRunJob — error paths', function () {
    it('marks run as Error with partial output when vendor throws mid-stream', function () {
        $chunks = [new LlmTokenChunk(text: 'partial'), new LlmTokenChunk(text: '...')];
        $throw = new VendorRateLimitedException('Vendor returned 429', retryAfterSeconds: 60);
        $run = pendingRunWithClient($chunks, throwAfter: $throw);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Error);
        expect($run->error_message)->toBe('Vendor returned 429');
        expect($run->output_text)->toBe('partial...');
        expect($run->token_log)->toHaveCount(2);
    });

    it('dispatches RunErrored with partial output when vendor fails mid-stream', function () {
        $chunks = [new LlmTokenChunk(text: 'hi')];
        $run = pendingRunWithClient($chunks, throwAfter: InvalidApiKeyException::forVendor('openai'));

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));

        Event::assertDispatched(RunErrored::class, function ($e) use ($run) {
            return $e->run->id === $run->id
                && $e->partialOutput === 'hi'
                && str_contains($e->message, 'openai');
        });
        Event::assertNotDispatched(RunCompleted::class);
    });

    it('marks run as Error with null partial when stream fails before any chunk', function () {
        $run = pendingRunWithClient([], throwAfter: InvalidApiKeyException::forVendor('openai'));

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Error);
        expect($run->output_text)->toBeNull();
        expect($run->token_log)->toBeNull();
    });

    it('marks run as Error if API key disappeared between submission and execution', function () {
        $user = User::factory()->create();
        $model = LlmModel::factory()->vendor('openai')->create();
        $thread = Thread::factory()->for($user)->create();
        $run = Run::factory()->for($user)->for($thread)->for($model, 'model')->create();
        app(LlmClientFactory::class)->register(new FakeStreamingClient('openai', []));
        // No API key was ever created for this user.

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Error);
        expect($run->error_message)->toContain("No API key on file for vendor 'openai'");
        Event::assertDispatched(RunErrored::class);
        Event::assertNotDispatched(RunStarted::class);
    });

    it('marks run as Error when no client is registered for the vendor', function () {
        $user = User::factory()->create();
        ApiKey::factory()->for($user)->vendor('openai')->create();
        $model = LlmModel::factory()->vendor('openai')->create();
        $thread = Thread::factory()->for($user)->create();
        $run = Run::factory()->for($user)->for($thread)->for($model, 'model')->create();
        // Intentionally no client registered.

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Error);
        Event::assertDispatched(RunErrored::class);
    });
});

describe('StreamRunJob — Meta→Together fallback', function () {
    it('uses a together key when the model vendor is meta and no meta key exists', function () {
        $user = User::factory()->create();
        ApiKey::factory()->for($user)->vendor('together')->create();
        $model = LlmModel::factory()->vendor('meta')->create();
        $thread = Thread::factory()->for($user)->create();
        $run = Run::factory()->for($user)->for($thread)->for($model, 'model')->create([
            'parameters' => ['model_snapshot' => ['layers' => 32]],
        ]);
        app(LlmClientFactory::class)->register(new FakeStreamingClient('meta', [
            new LlmTokenChunk(text: 'ok'),
        ]));

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Complete);
    });

    it('errors when neither meta nor together keys exist for a meta model', function () {
        $user = User::factory()->create();
        $model = LlmModel::factory()->vendor('meta')->create();
        $thread = Thread::factory()->for($user)->create();
        $run = Run::factory()->for($user)->for($thread)->for($model, 'model')->create();
        app(LlmClientFactory::class)->register(new FakeStreamingClient('meta', []));

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Error);
        expect($run->error_message)->toContain("vendor 'meta'");
    });
});

describe('StreamRunJob — idempotency', function () {
    it('does nothing if the run is no longer Pending (already-streaming retry)', function () {
        $chunks = [new LlmTokenChunk(text: 'a')];
        $run = pendingRunWithClient($chunks);
        $run->update(['status' => RunStatus::Streaming]);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Streaming);
        Event::assertNotDispatched(RunStarted::class);
        Event::assertNotDispatched(TokenReceived::class);
        Event::assertNotDispatched(RunCompleted::class);
    });

    it('does nothing if the run already terminated', function () {
        $chunks = [new LlmTokenChunk(text: 'a')];
        $run = pendingRunWithClient($chunks);
        $run->update(['status' => RunStatus::Complete, 'output_text' => 'previous output']);

        Event::fake();
        (new StreamRunJob($run))->handle(app(LlmClientFactory::class));
        $run->refresh();

        expect($run->status)->toBe(RunStatus::Complete);
        expect($run->output_text)->toBe('previous output');
        Event::assertNotDispatched(RunStarted::class);
    });
});
