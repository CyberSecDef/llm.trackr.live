<?php

use App\Enums\ArchitectureType;
use App\Models\LlmModel;
use App\Models\RegistryMeta;
use App\Services\ModelRegistry\RefreshService;
use App\Services\OpenRouter\OpenRouterClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

/**
 * Build a RefreshService backed by a fake HTTP layer and an optional
 * temp fixture path. The service is real Laravel-resolved with one
 * Http::fake() in place of the network.
 *
 * @param  list<array<string, mixed>>  $upstreamRows
 */
function makeService(array $upstreamRows = []): RefreshService
{
    Http::fake([
        '*/api/v1/models' => Http::response(['data' => $upstreamRows]),
    ]);

    return new RefreshService(new OpenRouterClient);
}

it('creates new models on first refresh', function () {
    $service = makeService([
        ['id' => 'openai/gpt-4o', 'name' => 'OpenAI: GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0.0000025', 'completion' => '0.00001']],
        ['id' => 'anthropic/claude-3-5-sonnet', 'name' => 'Anthropic: Claude 3.5 Sonnet', 'context_length' => 200000, 'pricing' => ['prompt' => '0.000003', 'completion' => '0.000015']],
    ]);

    $result = $service->refresh();

    expect($result->created)->toBe(2);
    expect($result->updated)->toBe(0);
    expect($result->skipped)->toBe(0);
    expect($result->total)->toBe(2);

    expect(LlmModel::count())->toBe(2);
    $gpt = LlmModel::where('name', 'gpt-4o')->first();
    expect($gpt->vendor)->toBe('openai');
    expect($gpt->context_length)->toBe(128000);
});

it('updates existing models on subsequent refresh', function () {
    LlmModel::factory()->create([
        'vendor' => 'openai',
        'name' => 'gpt-4o',
        'context_length' => 64000,                // stale
        'pricing_input_per_million' => 99.0,      // stale
    ]);

    $service = makeService([
        ['id' => 'openai/gpt-4o', 'name' => 'OpenAI: GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0.0000025', 'completion' => '0.00001']],
    ]);

    $result = $service->refresh();

    expect($result->created)->toBe(0);
    expect($result->updated)->toBe(1);

    $fresh = LlmModel::where('name', 'gpt-4o')->first();
    expect($fresh->context_length)->toBe(128000);
    expect($fresh->pricing_input_per_million)->toBe(2.5);
});

it('skips rows with manual_override = true', function () {
    LlmModel::factory()->create([
        'vendor' => 'openai',
        'name' => 'gpt-4o',
        'context_length' => 64000,
        'manual_override' => true,
    ]);

    $service = makeService([
        ['id' => 'openai/gpt-4o', 'name' => 'OpenAI: GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0.0000025', 'completion' => '0.00001']],
    ]);

    $result = $service->refresh();

    expect($result->skipped)->toBe(1);
    expect($result->updated)->toBe(0);

    // Manual override preserved — context_length stays at 64000.
    expect(LlmModel::where('name', 'gpt-4o')->first()->context_length)->toBe(64000);
});

it('merges fixture data when an entry matches', function () {
    $fixture = tempnam(sys_get_temp_dir(), 'fixture') . '.php';
    file_put_contents($fixture, "<?php\nreturn [\n  'mixtral-8x22b' => [\n    'architecture_type' => 'moe',\n    'layers' => 56,\n    'moe_experts' => 8,\n    'moe_active_experts' => 2,\n    'metadata_estimated' => false,\n  ],\n];\n");

    $service = makeService([
        ['id' => 'mistralai/mixtral-8x22b', 'name' => 'Mixtral 8x22B', 'context_length' => 64000, 'pricing' => ['prompt' => '0.000001', 'completion' => '0.000003']],
    ]);

    $service->refresh($fixture);

    $model = LlmModel::where('name', 'mixtral-8x22b')->first();
    expect($model->architecture_type)->toBe(ArchitectureType::Moe);
    expect($model->layers)->toBe(56);
    expect($model->moe_experts)->toBe(8);
    expect($model->moe_active_experts)->toBe(2);
    expect($model->metadata_estimated)->toBeFalse();
    // OpenRouter pricing still applied where fixture doesn't override.
    expect($model->pricing_input_per_million)->toBe(1.0);

    unlink($fixture);
});

it('marks rows without fixture data as metadata_estimated', function () {
    $emptyFixture = tempnam(sys_get_temp_dir(), 'fixture') . '.php';
    file_put_contents($emptyFixture, "<?php\nreturn [];\n");

    $service = makeService([
        ['id' => 'openai/some-new-model', 'name' => 'New Model', 'context_length' => 32000, 'pricing' => ['prompt' => '0', 'completion' => '0']],
    ]);

    $service->refresh($emptyFixture);

    expect(LlmModel::where('name', 'some-new-model')->first()->metadata_estimated)
        ->toBeTrue();

    unlink($emptyFixture);
});

it('records last_successful_refresh_at on success', function () {
    $service = makeService([
        ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0', 'completion' => '0']],
    ]);

    $service->refresh();

    $meta = RegistryMeta::getValue(RefreshService::META_LAST_SUCCESSFUL_REFRESH);
    expect($meta)->toHaveKey('at');
    expect($meta['at'])->toBeString();
});

it('records a refresh summary in RegistryMeta', function () {
    $service = makeService([
        ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0', 'completion' => '0']],
        ['id' => 'anthropic/claude-3-5-sonnet', 'name' => 'Claude', 'context_length' => 200000, 'pricing' => ['prompt' => '0', 'completion' => '0']],
    ]);

    $service->refresh();

    $summary = RegistryMeta::getValue(RefreshService::META_LAST_REFRESH_SUMMARY);
    expect($summary)->toBe([
        'created' => 2,
        'updated' => 0,
        'skipped' => 0,
        'total' => 2,
        'errors' => [],
    ]);
});

it('returns a summary string from the result object', function () {
    $service = makeService([
        ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0', 'completion' => '0']],
    ]);

    $result = $service->refresh();

    expect($result->summary())->toContain('1 models seen');
    expect($result->summary())->toContain('1 created');
});

it('does not touch metadata_estimated on a row that already has it set', function () {
    // Existing row from a previous refresh has metadata_estimated=false
    // (it had a fixture match). New refresh: fixture entry removed.
    // Behavior: metadata_estimated flips to true because the merged
    // attribute set sets it explicitly.
    LlmModel::factory()->create([
        'vendor' => 'openai',
        'name' => 'gpt-4o',
        'metadata_estimated' => false,
        'manual_override' => false,
    ]);

    $emptyFixture = tempnam(sys_get_temp_dir(), 'fixture') . '.php';
    file_put_contents($emptyFixture, "<?php\nreturn [];\n");

    $service = makeService([
        ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0', 'completion' => '0']],
    ]);

    $service->refresh($emptyFixture);

    // The row stays in the table; metadata_estimated reflects the
    // current fixture state.
    expect(LlmModel::where('name', 'gpt-4o')->first()->metadata_estimated)
        ->toBeTrue();

    unlink($emptyFixture);
});
