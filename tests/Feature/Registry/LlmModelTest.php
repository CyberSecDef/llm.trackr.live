<?php

use App\Enums\ArchitectureType;
use App\Enums\PositionEncoding;
use App\Models\LlmModel;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('persists all spec-mandated columns', function () {
    $model = LlmModel::factory()->create([
        'vendor' => 'openai',
        'name' => 'gpt-4o',
        'display_name' => 'GPT-4o',
        'context_length' => 128000,
        'pricing_input_per_million' => 2.50,
        'pricing_output_per_million' => 10.00,
    ]);

    $fresh = LlmModel::find($model->id);

    expect($fresh->vendor)->toBe('openai');
    expect($fresh->name)->toBe('gpt-4o');
    expect($fresh->display_name)->toBe('GPT-4o');
    expect($fresh->context_length)->toBe(128000);
    expect($fresh->pricing_input_per_million)->toBe(2.50);
    expect($fresh->pricing_output_per_million)->toBe(10.00);
});

it('casts architecture_type to the ArchitectureType enum', function () {
    $dense = LlmModel::factory()->create(['architecture_type' => ArchitectureType::Dense]);
    $moe = LlmModel::factory()->moe()->create();

    expect($dense->architecture_type)->toBe(ArchitectureType::Dense);
    expect($moe->architecture_type)->toBe(ArchitectureType::Moe);
    expect($dense->isMoe())->toBeFalse();
    expect($moe->isMoe())->toBeTrue();
});

it('casts position_encoding to the PositionEncoding enum', function () {
    $model = LlmModel::factory()->create(['position_encoding' => PositionEncoding::Alibi]);

    expect(LlmModel::find($model->id)->position_encoding)->toBe(PositionEncoding::Alibi);
});

it('casts supported_params to an array', function () {
    $model = LlmModel::factory()->create([
        'supported_params' => [
            'temperature' => true,
            'top_p' => true,
            'top_k' => false,
        ],
    ]);

    $params = LlmModel::find($model->id)->supported_params;

    expect($params)->toBe([
        'temperature' => true,
        'top_p' => true,
        'top_k' => false,
    ]);
});

it('casts pricing columns to float', function () {
    $model = LlmModel::factory()->create([
        'pricing_input_per_million' => '2.50',
        'pricing_output_per_million' => '10.00',
    ]);

    $fresh = LlmModel::find($model->id);

    expect($fresh->pricing_input_per_million)->toBeFloat();
    expect($fresh->pricing_output_per_million)->toBeFloat();
});

it('defaults boolean capability flags correctly', function () {
    $model = LlmModel::factory()->create();

    expect($model->supports_streaming)->toBeTrue();
    expect($model->supports_logprobs)->toBeFalse();
    expect($model->supports_seed)->toBeFalse();
    expect($model->manual_override)->toBeFalse();
    expect($model->metadata_estimated)->toBeFalse();
});

it('marks a model as estimated via the factory state', function () {
    $model = LlmModel::factory()->estimated()->create();

    expect($model->metadata_estimated)->toBeTrue();
});

it('marks a model as manually-overridden via the factory state', function () {
    $model = LlmModel::factory()->manuallyOverridden()->create();

    expect($model->manual_override)->toBeTrue();
});

it('configures MoE state correctly', function () {
    $moe = LlmModel::factory()->moe(experts: 8, activeExperts: 2)->create();

    expect($moe->architecture_type)->toBe(ArchitectureType::Moe);
    expect($moe->moe_experts)->toBe(8);
    expect($moe->moe_active_experts)->toBe(2);
});

it('enforces unique model names across the table', function () {
    LlmModel::factory()->create(['name' => 'gpt-4o']);

    expect(fn () => LlmModel::factory()->create(['name' => 'gpt-4o']))
        ->toThrow(UniqueConstraintViolationException::class);
});

it('allows null architecture metadata for vendors that do not expose it', function () {
    $model = LlmModel::factory()->create([
        'architecture_type' => null,
        'layers' => null,
        'hidden_dim' => null,
        'attention_heads' => null,
        'position_encoding' => null,
    ]);

    $fresh = LlmModel::find($model->id);

    expect($fresh->architecture_type)->toBeNull();
    expect($fresh->layers)->toBeNull();
    expect($fresh->hidden_dim)->toBeNull();
    expect($fresh->position_encoding)->toBeNull();
});
