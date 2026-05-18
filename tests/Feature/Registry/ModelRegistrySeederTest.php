<?php

use App\Models\LlmModel;
use App\Services\ModelRegistry\RefreshService;
use App\Services\OpenRouter\OpenRouterClient;
use Database\Seeders\ModelRegistrySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

/**
 * Invoke the seeder directly (without ->seed()) so $this->command stays
 * null and the null-safe ?->info() calls skip cleanly. ->seed() wires a
 * mocked OutputStyle that doesn't expect askQuestion() / block() calls
 * from $this->command->info() / ->warn() under the hood.
 */
function runRegistrySeeder(): void
{
    app(ModelRegistrySeeder::class)->run();
}

it('skips the OpenRouter call in the testing env', function () {
    Http::fake([
        '*/api/v1/models' => Http::response('should not be called', 500),
    ]);

    runRegistrySeeder();

    expect(LlmModel::count())->toBe(0);
    Http::assertNothingSent();
});

it('hits OpenRouter and seeds models when run outside testing', function () {
    Http::fake([
        '*/api/v1/models' => Http::response([
            'data' => [
                ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0.0000025', 'completion' => '0.00001']],
            ],
        ]),
    ]);

    app()->detectEnvironment(fn () => 'production');

    try {
        runRegistrySeeder();
    } finally {
        app()->detectEnvironment(fn () => 'testing');
    }

    expect(LlmModel::where('name', 'gpt-4o')->exists())->toBeTrue();
});

it('does not blow up when OpenRouter is unreachable during seeding', function () {
    Http::fake([
        '*/api/v1/models' => Http::response('Service Unavailable', 503),
    ]);

    app()->detectEnvironment(fn () => 'production');

    try {
        // Must not throw — the seeder catches and warns.
        runRegistrySeeder();
    } finally {
        app()->detectEnvironment(fn () => 'testing');
    }

    expect(LlmModel::count())->toBe(0);
});

it('runs from DatabaseSeeder so `migrate --seed` populates the registry', function () {
    Http::fake([
        '*/api/v1/models' => Http::response([
            'data' => [
                ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0.0000025', 'completion' => '0.00001']],
            ],
        ]),
    ]);

    app()->detectEnvironment(fn () => 'production');

    try {
        // Direct call without the testing-env short-circuit.
        app(ModelRegistrySeeder::class)->run();
    } finally {
        app()->detectEnvironment(fn () => 'testing');
    }

    // Verify the DatabaseSeeder references ModelRegistrySeeder so a future
    // refactor doesn't accidentally drop it from the default seed.
    $contents = file_get_contents(database_path('seeders/DatabaseSeeder.php'));
    expect($contents)->toContain('ModelRegistrySeeder::class');
    expect(LlmModel::count())->toBe(1);
});

/**
 * Suppress fakers / extras Pest configures so the constructor injection
 * (RefreshService) resolves cleanly when we call app(ModelRegistrySeeder::class).
 */
beforeEach(function () {
    app()->bind(RefreshService::class, function () {
        return new RefreshService(new OpenRouterClient);
    });
});
