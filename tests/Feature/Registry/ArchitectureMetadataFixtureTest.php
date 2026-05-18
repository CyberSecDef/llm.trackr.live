<?php

it('is a syntactically-valid PHP file that returns an array', function () {
    $path = database_path('seeders/data/architecture_metadata.php');
    expect(file_exists($path))->toBeTrue();

    $data = require $path;
    expect($data)->toBeArray();
});

it('contains entries for every Phase 1 launch-set model', function () {
    $launchSet = [
        'gpt-4o',
        'gpt-4o-mini',
        'claude-3-5-sonnet',
        'claude-3-5-haiku',
        'gemini-1.5-pro',
        'grok-2',
        'llama-3.1-70b',
        'llama-3.1-405b',
        'mixtral-8x22b',
        'mistral-large',
    ];

    $fixture = require database_path('seeders/data/architecture_metadata.php');

    foreach ($launchSet as $name) {
        expect($fixture)->toHaveKey($name);
    }
});

it('marks closed-source models as estimated and open-weights as not', function () {
    $fixture = require database_path('seeders/data/architecture_metadata.php');

    // Closed-source — we don't know the exact architecture.
    expect($fixture['gpt-4o']['metadata_estimated'])->toBeTrue();
    expect($fixture['claude-3-5-sonnet']['metadata_estimated'])->toBeTrue();
    expect($fixture['gemini-1.5-pro']['metadata_estimated'])->toBeTrue();

    // Open-weights — model cards are public.
    expect($fixture['llama-3.1-70b']['metadata_estimated'])->toBeFalse();
    expect($fixture['llama-3.1-405b']['metadata_estimated'])->toBeFalse();
    expect($fixture['mixtral-8x22b']['metadata_estimated'])->toBeFalse();
});

it('encodes Mixtral 8x22B MoE structure correctly', function () {
    $fixture = require database_path('seeders/data/architecture_metadata.php');

    $mixtral = $fixture['mixtral-8x22b'];

    expect($mixtral['architecture_type'])->toBe('moe');
    expect($mixtral['moe_experts'])->toBe(8);
    expect($mixtral['moe_active_experts'])->toBe(2);
    expect($mixtral['layers'])->toBe(56);
});
