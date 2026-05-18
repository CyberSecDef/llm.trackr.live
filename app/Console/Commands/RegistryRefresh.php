<?php

namespace App\Console\Commands;

use App\Services\ModelRegistry\RefreshService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('registry:refresh {--fixture= : Override path to the architecture metadata fixture}')]
#[Description('Refresh the model registry from OpenRouter + the architecture metadata fixture.')]
class RegistryRefresh extends Command
{
    public function handle(RefreshService $service): int
    {
        $fixturePath = $this->option('fixture');

        $this->info('Fetching model catalog from OpenRouter…');

        try {
            $result = $service->refresh($fixturePath ?: null);
        } catch (Throwable $e) {
            // Use line() rather than error() — the latter wraps the message
            // in a styled red block that breaks across lines, which makes
            // CI assertions on substrings ("HTTP 503") flaky.
            $this->line('Registry refresh failed: ' . $e->getMessage());

            return self::FAILURE;
        }

        $this->line($result->summary());

        if ($result->errors !== []) {
            $this->warn(sprintf('%d per-row issues:', count($result->errors)));
            foreach ($result->errors as $error) {
                $this->line('  • ' . $error);
            }
        }

        return self::SUCCESS;
    }
}
