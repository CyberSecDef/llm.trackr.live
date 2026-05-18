<?php

use App\Models\ApiKey;
use App\Services\Llm\Contracts\LlmClientInterface;
use App\Services\Llm\LlmClientFactory;
use App\Services\Llm\LlmCompletion;
use App\Services\Llm\LlmTokenChunk;
use App\Services\Llm\LlmUsage;

/**
 * Build a fake client that records calls and returns a configurable
 * completion. Swapped into LlmClientFactory per-test so the smoke
 * command exercises real factory wiring but no real network.
 */
function fakeClient(string $vendor, string $responseText = 'ok', ?Throwable $throw = null): LlmClientInterface
{
    return new class($vendor, $responseText, $throw) implements LlmClientInterface
    {
        public function __construct(
            private readonly string $vendor,
            private readonly string $responseText,
            private readonly ?Throwable $throw,
        ) {}

        public function vendor(): string
        {
            return $this->vendor;
        }

        public function stream(ApiKey $apiKey, string $model, string $prompt, array $params, array $history = []): Generator
        {
            yield new LlmTokenChunk(text: $this->responseText);
        }

        public function complete(ApiKey $apiKey, string $model, string $prompt, array $params, array $history = []): LlmCompletion
        {
            if ($this->throw !== null) {
                throw $this->throw;
            }

            return new LlmCompletion(
                text: $this->responseText,
                usage: new LlmUsage(inputTokens: 5, outputTokens: 2),
            );
        }
    };
}

function swapFactory(LlmClientInterface ...$clients): void
{
    // Construct a fresh factory, register the fakes, and rebind
    // the singleton so the artisan command resolves it.
    $factory = new LlmClientFactory;
    foreach ($clients as $client) {
        $factory->register($client);
    }
    app()->instance(LlmClientFactory::class, $factory);
}

it('runs each registered vendor and exits 0 when all pass', function () {
    putenv('SMOKE_TEST_OPENAI_KEY=sk-openai');
    putenv('SMOKE_TEST_ANTHROPIC_KEY=sk-ant');
    swapFactory(fakeClient('openai'), fakeClient('anthropic'));

    $this->artisan('vendors:smoke-test')
        ->expectsOutputToContain('openai')
        ->expectsOutputToContain('anthropic')
        ->expectsOutputToContain('2 passed, 0 failed')
        ->assertSuccessful();

    putenv('SMOKE_TEST_OPENAI_KEY=');
    putenv('SMOKE_TEST_ANTHROPIC_KEY=');
});

it('skips vendors whose SMOKE_TEST_*_KEY env var is unset', function () {
    putenv('SMOKE_TEST_OPENAI_KEY=sk-openai');
    putenv('SMOKE_TEST_ANTHROPIC_KEY='); // explicitly unset
    swapFactory(fakeClient('openai'), fakeClient('anthropic'));

    $this->artisan('vendors:smoke-test')
        ->expectsOutputToContain('SMOKE_TEST_ANTHROPIC_KEY not set')
        ->expectsOutputToContain('1 passed, 0 failed, 1 skipped')
        ->assertSuccessful();

    putenv('SMOKE_TEST_OPENAI_KEY=');
});

it('exits 0 when no keys are configured (safe to run before keys are provisioned)', function () {
    // No keys set; all vendors should be skipped.
    swapFactory(fakeClient('openai'), fakeClient('anthropic'));

    $this->artisan('vendors:smoke-test')
        ->expectsOutputToContain('0 passed, 0 failed, 2 skipped')
        ->assertSuccessful();
});

it('returns non-zero exit on any failure', function () {
    putenv('SMOKE_TEST_OPENAI_KEY=sk-openai');
    swapFactory(fakeClient('openai', responseText: '', throw: new RuntimeException('boom')));

    $this->artisan('vendors:smoke-test')
        ->expectsOutputToContain('boom')
        ->assertFailed();

    putenv('SMOKE_TEST_OPENAI_KEY=');
});

it('stops at first failure by default', function () {
    putenv('SMOKE_TEST_OPENAI_KEY=sk-openai');
    putenv('SMOKE_TEST_ANTHROPIC_KEY=sk-ant');
    swapFactory(
        fakeClient('openai', throw: new RuntimeException('first vendor down')),
        fakeClient('anthropic'),
    );

    $this->artisan('vendors:smoke-test')
        ->expectsOutputToContain('first vendor down')
        ->expectsOutputToContain('Stopping at first failure')
        ->assertFailed();

    putenv('SMOKE_TEST_OPENAI_KEY=');
    putenv('SMOKE_TEST_ANTHROPIC_KEY=');
});

it('with --keep-going continues past failures', function () {
    putenv('SMOKE_TEST_OPENAI_KEY=sk-openai');
    putenv('SMOKE_TEST_ANTHROPIC_KEY=sk-ant');
    swapFactory(
        fakeClient('openai', throw: new RuntimeException('openai down')),
        fakeClient('anthropic'),
    );

    $this->artisan('vendors:smoke-test', ['--keep-going' => true])
        ->expectsOutputToContain('openai down')
        ->expectsOutputToContain('1 passed, 1 failed')
        ->assertFailed();

    putenv('SMOKE_TEST_OPENAI_KEY=');
    putenv('SMOKE_TEST_ANTHROPIC_KEY=');
});

it('respects --vendor filter', function () {
    putenv('SMOKE_TEST_OPENAI_KEY=sk-openai');
    putenv('SMOKE_TEST_ANTHROPIC_KEY=sk-ant');
    swapFactory(fakeClient('openai'), fakeClient('anthropic'));

    $this->artisan('vendors:smoke-test', ['--vendor' => ['openai']])
        ->expectsOutputToContain('openai')
        ->doesntExpectOutput('anthropic')
        ->expectsOutputToContain('1 passed')
        ->assertSuccessful();

    putenv('SMOKE_TEST_OPENAI_KEY=');
    putenv('SMOKE_TEST_ANTHROPIC_KEY=');
});

it('flags an empty completion as a failure', function () {
    putenv('SMOKE_TEST_OPENAI_KEY=sk-openai');
    swapFactory(fakeClient('openai', responseText: ''));

    $this->artisan('vendors:smoke-test')
        ->expectsOutputToContain('empty completion')
        ->assertFailed();

    putenv('SMOKE_TEST_OPENAI_KEY=');
});

it('skips a vendor when the factory does not have it', function () {
    putenv('SMOKE_TEST_OPENAI_KEY=sk-openai');
    swapFactory(); // empty factory — no registrations

    $this->artisan('vendors:smoke-test', ['--vendor' => ['openai']])
        ->expectsOutputToContain('vendor not registered')
        ->assertSuccessful();

    putenv('SMOKE_TEST_OPENAI_KEY=');
});
