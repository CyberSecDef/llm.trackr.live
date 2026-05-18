<?php

namespace App\Console\Commands;

use App\Models\ApiKey;
use App\Services\Llm\Exceptions\LlmClientException;
use App\Services\Llm\LlmClientFactory;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

/**
 * Live-fire smoke test against every registered LLM vendor.
 *
 * Used by an operator to confirm BYOK + base-URL + auth-header
 * plumbing is intact before a release, and to catch vendor-side
 * surprises (renamed models, changed pricing-tier requirements, etc.)
 * that mocked unit tests can't catch.
 *
 * Each vendor needs an env-supplied test key (SMOKE_TEST_{VENDOR}_KEY)
 * and a known-good model name. Vendors without a key configured are
 * skipped with a clear notice — running with no env at all still
 * exits 0 to make `php artisan vendors:smoke-test` safe in CI even
 * before keys are provisioned.
 *
 * Not auto-run by the CI test workflow — costs real money + needs
 * production credentials.
 */
#[Signature('vendors:smoke-test
    {--vendor=* : Limit to specific vendor(s); repeatable.}
    {--keep-going : Continue past failures instead of stopping on the first one.}
')]
#[Description('Fire a tiny prompt at each registered LLM vendor using SMOKE_TEST_*_KEY env vars.')]
class VendorsSmokeTest extends Command
{
    /**
     * Defaults: a small, fast model per vendor + the env var that
     * holds the test key. Override the model via SMOKE_TEST_{VENDOR}_MODEL
     * if a vendor renames or retires the default.
     *
     * @var array<string, array{env: string, model_env: string, default_model: string}>
     */
    private const VENDOR_CONFIG = [
        'openai' => ['env' => 'SMOKE_TEST_OPENAI_KEY', 'model_env' => 'SMOKE_TEST_OPENAI_MODEL', 'default_model' => 'gpt-4o-mini'],
        'anthropic' => ['env' => 'SMOKE_TEST_ANTHROPIC_KEY', 'model_env' => 'SMOKE_TEST_ANTHROPIC_MODEL', 'default_model' => 'claude-3-5-haiku-latest'],
        'google' => ['env' => 'SMOKE_TEST_GOOGLE_KEY', 'model_env' => 'SMOKE_TEST_GOOGLE_MODEL', 'default_model' => 'gemini-1.5-flash'],
        'xai' => ['env' => 'SMOKE_TEST_XAI_KEY', 'model_env' => 'SMOKE_TEST_XAI_MODEL', 'default_model' => 'grok-2-1212'],
        'mistral' => ['env' => 'SMOKE_TEST_MISTRAL_KEY', 'model_env' => 'SMOKE_TEST_MISTRAL_MODEL', 'default_model' => 'mistral-small-latest'],
        'groq' => ['env' => 'SMOKE_TEST_GROQ_KEY', 'model_env' => 'SMOKE_TEST_GROQ_MODEL', 'default_model' => 'llama-3.1-8b-instant'],
        'together' => ['env' => 'SMOKE_TEST_TOGETHER_KEY', 'model_env' => 'SMOKE_TEST_TOGETHER_MODEL', 'default_model' => 'meta-llama/Llama-3.1-8B-Instruct-Turbo'],
        'huggingface' => ['env' => 'SMOKE_TEST_HUGGINGFACE_KEY', 'model_env' => 'SMOKE_TEST_HUGGINGFACE_MODEL', 'default_model' => 'meta-llama/Meta-Llama-3-8B-Instruct'],
        'meta' => ['env' => 'SMOKE_TEST_TOGETHER_KEY', 'model_env' => 'SMOKE_TEST_META_MODEL', 'default_model' => 'meta-llama/Llama-3.1-8B-Instruct-Turbo'],
    ];

    public function handle(LlmClientFactory $factory): int
    {
        $requested = (array) $this->option('vendor');
        $keepGoing = (bool) $this->option('keep-going');

        $vendors = $requested !== []
            ? $requested
            : $factory->supportedVendors();

        $results = [];
        $anyFailed = false;

        foreach ($vendors as $vendor) {
            $result = $this->attemptVendor($factory, $vendor);
            $results[$vendor] = $result;

            $this->reportRow($vendor, $result);

            if ($result['status'] === 'failed') {
                $anyFailed = true;
                if (! $keepGoing) {
                    $this->line('');
                    $this->line('Stopping at first failure. Re-run with --keep-going to test the rest.');
                    break;
                }
            }
        }

        $this->line('');
        $this->line($this->summaryLine($results));

        return $anyFailed ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @return array{status: string, message: string}
     */
    private function attemptVendor(LlmClientFactory $factory, string $vendor): array
    {
        $config = self::VENDOR_CONFIG[$vendor] ?? null;
        if ($config === null) {
            return ['status' => 'skipped', 'message' => 'no smoke-test config for this vendor'];
        }

        $key = env($config['env']);
        if (! is_string($key) || $key === '') {
            return ['status' => 'skipped', 'message' => "{$config['env']} not set"];
        }

        if (! $factory->supports($vendor)) {
            return ['status' => 'skipped', 'message' => 'vendor not registered with the factory'];
        }

        $model = (string) (env($config['model_env']) ?: $config['default_model']);

        // Ephemeral ApiKey — never persisted. ApiKey::touchUsed() is
        // a no-op for transient instances, so no side effects.
        $apiKey = new ApiKey;
        $apiKey->vendor = $vendor;
        $apiKey->encrypted_key = $key;

        try {
            $client = $factory->clientFor($vendor);
            $completion = $client->complete(
                $apiKey,
                $model,
                'Say "ok" and nothing else.',
                ['max_tokens' => 10, 'temperature' => 0],
            );
        } catch (LlmClientException $e) {
            return ['status' => 'failed', 'message' => $e->getMessage()];
        } catch (Throwable $e) {
            return ['status' => 'failed', 'message' => '[' . $e::class . '] ' . $e->getMessage()];
        }

        $text = trim($completion->text);

        return [
            'status' => $text === '' ? 'failed' : 'passed',
            'message' => $text === ''
                ? 'vendor returned empty completion'
                : sprintf('"%s" (%d in / %d out tokens)',
                    mb_substr($text, 0, 40),
                    $completion->usage->inputTokens,
                    $completion->usage->outputTokens,
                ),
        ];
    }

    /**
     * @param  array{status: string, message: string}  $result
     */
    private function reportRow(string $vendor, array $result): void
    {
        $glyph = match ($result['status']) {
            'passed' => '✓',
            'failed' => '✗',
            'skipped' => '○',
            default => '?',
        };
        $this->line(sprintf('  %s  %-15s %s', $glyph, $vendor, $result['message']));
    }

    /**
     * @param  array<string, array{status: string, message: string}>  $results
     */
    private function summaryLine(array $results): string
    {
        $counts = ['passed' => 0, 'failed' => 0, 'skipped' => 0];
        foreach ($results as $r) {
            $counts[$r['status']] = ($counts[$r['status']] ?? 0) + 1;
        }

        return sprintf(
            '%d passed, %d failed, %d skipped (of %d vendor%s tested)',
            $counts['passed'],
            $counts['failed'],
            $counts['skipped'],
            count($results),
            count($results) === 1 ? '' : 's',
        );
    }
}
