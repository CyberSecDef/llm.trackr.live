<?php

namespace App\Services\ModelRegistry;

use App\Models\LlmModel;
use App\Models\RegistryMeta;
use App\Services\OpenRouter\OpenRouterClient;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Refreshes the local model registry from OpenRouter + the architecture
 * metadata fixture. Run weekly via the scheduler (chunk 3) and on-demand
 * via `php artisan registry:refresh`.
 *
 * Behavior (per SPEC §7.1):
 *   - Fetch /models from OpenRouter.
 *   - For each row, look up architecture details in the fixture by name.
 *   - Upsert into the `models` table.
 *   - Rows with `manual_override = true` are skipped entirely — admin
 *     edits win against the upstream refresh.
 *   - On success, RegistryMeta::setValue('last_successful_refresh_at', …)
 *     so the staleness banner (chunk 5) can detect old data.
 *
 * The orchestration runs in a DB transaction so a mid-refresh failure
 * doesn't leave the registry half-updated.
 */
class RefreshService
{
    public const META_LAST_SUCCESSFUL_REFRESH = 'last_successful_refresh_at';

    public const META_LAST_REFRESH_SUMMARY = 'last_refresh_summary';

    public function __construct(
        private readonly OpenRouterClient $openRouter,
    ) {}

    /**
     * @param  string|null  $fixturePath  Override for the architecture fixture file (for tests).
     */
    public function refresh(?string $fixturePath = null): RefreshResult
    {
        $upstream = $this->openRouter->fetchModels();
        $fixture = $this->loadFixture($fixturePath);

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        DB::transaction(function () use ($upstream, $fixture, &$created, &$updated, &$skipped, &$errors) {
            foreach ($upstream as $row) {
                try {
                    $existing = LlmModel::where('name', $row['name'])->first();

                    if ($existing && $existing->manual_override) {
                        $skipped++;

                        continue;
                    }

                    $attributes = $this->mergeRow($row, $fixture);

                    if ($existing) {
                        $existing->fill($attributes)->save();
                        $updated++;
                    } else {
                        LlmModel::create($attributes);
                        $created++;
                    }
                } catch (Throwable $e) {
                    $errors[] = sprintf(
                        '%s: %s',
                        $row['name'] ?? '<unknown>',
                        $e->getMessage(),
                    );
                }
            }
        });

        $result = new RefreshResult(
            created: $created,
            updated: $updated,
            skipped: $skipped,
            total: count($upstream),
            errors: $errors,
        );

        $this->recordSuccess($result);

        return $result;
    }

    /**
     * Merge an OpenRouter row with the architecture fixture entry (if any).
     * Fixture wins where the two overlap (e.g. display_name override).
     *
     * @param  array<string, mixed>  $row
     * @param  array<string, array<string, mixed>>  $fixture
     * @return array<string, mixed>
     */
    private function mergeRow(array $row, array $fixture): array
    {
        $base = [
            'vendor' => $row['vendor'],
            'name' => $row['name'],
            'display_name' => $row['display_name'] ?? null,
            'context_length' => $row['context_length'] ?? null,
            'pricing_input_per_million' => $row['pricing_input_per_million'] ?? null,
            'pricing_output_per_million' => $row['pricing_output_per_million'] ?? null,
        ];

        $fixtureEntry = $fixture[$row['name']] ?? null;

        if ($fixtureEntry === null) {
            // No fixture for this model — architecture details stay null and
            // metadata_estimated defaults to true so the UI flags it.
            $base['metadata_estimated'] = true;

            return $base;
        }

        // Fixture wins for overlapping fields (e.g. display_name override).
        return array_merge($base, $fixtureEntry);
    }

    /**
     * Load the architecture metadata fixture. Default location is
     * database/seeders/data/architecture_metadata.php.
     *
     * @return array<string, array<string, mixed>>
     */
    private function loadFixture(?string $path): array
    {
        $resolved = $path ?? database_path('seeders/data/architecture_metadata.php');

        if (! is_file($resolved)) {
            return [];
        }

        $data = require $resolved;

        return is_array($data) ? $data : [];
    }

    private function recordSuccess(RefreshResult $result): void
    {
        RegistryMeta::setValue(self::META_LAST_SUCCESSFUL_REFRESH, [
            'at' => now()->toIso8601String(),
        ]);

        RegistryMeta::setValue(self::META_LAST_REFRESH_SUMMARY, [
            'created' => $result->created,
            'updated' => $result->updated,
            'skipped' => $result->skipped,
            'total' => $result->total,
            'errors' => $result->errors,
        ]);
    }
}
