<?php

use App\Models\LlmModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

it('exits 0 and prints a summary on a successful refresh', function () {
    Http::fake([
        '*/api/v1/models' => Http::response([
            'data' => [
                ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0.0000025', 'completion' => '0.00001']],
                ['id' => 'anthropic/claude-3-5-sonnet', 'name' => 'Claude', 'context_length' => 200000, 'pricing' => ['prompt' => '0.000003', 'completion' => '0.000015']],
            ],
        ]),
    ]);

    $this->artisan('registry:refresh')
        ->expectsOutputToContain('Fetching model catalog from OpenRouter')
        ->expectsOutputToContain('2 models seen: 2 created')
        ->assertSuccessful();

    expect(LlmModel::count())->toBe(2);
});

it('exits non-zero when the OpenRouter request fails', function () {
    Http::fake([
        '*/api/v1/models' => Http::response('Service Unavailable', 503),
    ]);

    $this->artisan('registry:refresh')
        ->expectsOutputToContain('Registry refresh failed: OpenRouter /models returned HTTP 503')
        ->assertFailed();
});

it('forwards the --fixture option to the service', function () {
    $fixture = tempnam(sys_get_temp_dir(), 'fixture') . '.php';
    file_put_contents(
        $fixture,
        "<?php\nreturn [\n  'gpt-4o' => [\n    'architecture_type' => 'dense',\n    'layers' => 120,\n    'metadata_estimated' => true,\n  ],\n];\n"
    );

    Http::fake([
        '*/api/v1/models' => Http::response([
            'data' => [
                ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0.0000025', 'completion' => '0.00001']],
            ],
        ]),
    ]);

    $this->artisan('registry:refresh', ['--fixture' => $fixture])
        ->assertSuccessful();

    $model = LlmModel::where('name', 'gpt-4o')->first();
    expect($model->layers)->toBe(120);

    unlink($fixture);
});
