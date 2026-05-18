<?php

namespace Database\Seeders;

use App\Services\ModelRegistry\RefreshService;
use Illuminate\Database\Seeder;
use Throwable;

/**
 * Seeds the initial model registry by invoking RefreshService against
 * the real OpenRouter API. Runs from DatabaseSeeder when an operator
 * executes `php artisan migrate --seed` on first deploy.
 *
 * Designed to be resilient: a network failure here logs a warning and
 * leaves the registry empty rather than blowing up the whole seed. The
 * operator can recover with `php artisan registry:refresh` later.
 */
class ModelRegistrySeeder extends Seeder
{
    public function __construct(
        private readonly RefreshService $service,
    ) {}

    public function run(): void
    {
        if (app()->environment('testing')) {
            // Tests have their own controlled fixtures via Http::fake().
            // Skip the real-network call here.
            return;
        }

        $this->command?->info('Refreshing model registry from OpenRouter…');

        try {
            $result = $this->service->refresh();
            $this->command?->line($result->summary());
        } catch (Throwable $e) {
            $this->command?->warn(
                'OpenRouter refresh failed; registry left empty. '
                . 'Run `php artisan registry:refresh` once connectivity is restored.'
            );
            $this->command?->warn('Error: ' . $e->getMessage());
        }
    }
}
