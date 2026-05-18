<?php

use App\Models\ApiKey;
use App\Services\Llm\Contracts\LlmClientInterface;
use App\Services\Llm\Exceptions\UnsupportedVendorException;
use App\Services\Llm\LlmClientFactory;
use App\Services\Llm\LlmCompletion;
use App\Services\Llm\LlmTokenChunk;
use App\Services\Llm\LlmUsage;

/**
 * Minimal fake to exercise the interface contract + factory.
 */
function makeFakeClient(string $vendor): LlmClientInterface
{
    return new class($vendor) implements LlmClientInterface
    {
        public function __construct(private readonly string $vendor) {}

        public function stream(ApiKey $apiKey, string $model, string $prompt, array $params, array $history = []): Generator
        {
            yield new LlmTokenChunk(text: 'hi');
        }

        public function complete(ApiKey $apiKey, string $model, string $prompt, array $params, array $history = []): LlmCompletion
        {
            return new LlmCompletion(
                text: 'hi',
                usage: new LlmUsage(inputTokens: 1, outputTokens: 1),
            );
        }

        public function vendor(): string
        {
            return $this->vendor;
        }
    };
}

it('returns the registered client for a known vendor', function () {
    $factory = new LlmClientFactory;
    $client = makeFakeClient('openai');
    $factory->register($client);

    expect($factory->clientFor('openai'))->toBe($client);
});

it('throws UnsupportedVendorException for an unregistered vendor', function () {
    $factory = new LlmClientFactory;

    expect(fn () => $factory->clientFor('unknown'))
        ->toThrow(UnsupportedVendorException::class, "vendor 'unknown'");
});

it('reports supports() correctly', function () {
    $factory = new LlmClientFactory;
    $factory->register(makeFakeClient('anthropic'));

    expect($factory->supports('anthropic'))->toBeTrue();
    expect($factory->supports('openai'))->toBeFalse();
});

it('lists supported vendors', function () {
    $factory = new LlmClientFactory;
    $factory->register(makeFakeClient('openai'));
    $factory->register(makeFakeClient('anthropic'));

    expect($factory->supportedVendors())->toContain('openai');
    expect($factory->supportedVendors())->toContain('anthropic');
});

it('is registered as a singleton in the container', function () {
    $a = app(LlmClientFactory::class);
    $b = app(LlmClientFactory::class);

    expect($a)->toBe($b);
});

it('persists registrations across resolves of the singleton', function () {
    $client = makeFakeClient('groq');
    app(LlmClientFactory::class)->register($client);

    // A fresh resolve should see the registration.
    expect(app(LlmClientFactory::class)->clientFor('groq'))->toBe($client);
});
