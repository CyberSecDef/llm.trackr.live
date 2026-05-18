<?php

use App\Models\RegistryMeta;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

it('upserts a key/value pair via setValue', function () {
    RegistryMeta::setValue('last_successful_refresh_at', ['at' => '2026-05-17T10:00:00Z']);

    expect(RegistryMeta::getValue('last_successful_refresh_at'))
        ->toBe(['at' => '2026-05-17T10:00:00Z']);
});

it('returns null for an unknown key', function () {
    expect(RegistryMeta::getValue('nonexistent'))->toBeNull();
});

it('overwrites an existing key on second setValue call', function () {
    RegistryMeta::setValue('counter', ['v' => 1]);
    RegistryMeta::setValue('counter', ['v' => 2]);

    expect(RegistryMeta::getValue('counter'))->toBe(['v' => 2]);
    expect(RegistryMeta::count())->toBe(1);
});

it('forgets a key', function () {
    RegistryMeta::setValue('to_be_removed', ['data' => 'gone']);
    RegistryMeta::forget('to_be_removed');

    expect(RegistryMeta::getValue('to_be_removed'))->toBeNull();
});

it('updates the updated_at timestamp on each set', function () {
    Carbon::setTestNow('2026-05-17 10:00:00');
    RegistryMeta::setValue('refresh', ['ok' => true]);
    $first = RegistryMeta::find('refresh')->updated_at;

    Carbon::setTestNow('2026-05-17 11:00:00');
    RegistryMeta::setValue('refresh', ['ok' => true]);
    $second = RegistryMeta::find('refresh')->updated_at;

    expect($second->isAfter($first))->toBeTrue();
});

it('stores complex nested JSON values', function () {
    $payload = [
        'last_refresh' => '2026-05-17T10:00:00Z',
        'models_added' => 3,
        'errors' => [],
        'source' => ['name' => 'openrouter', 'url' => 'https://openrouter.ai'],
    ];

    RegistryMeta::setValue('refresh_summary', $payload);

    expect(RegistryMeta::getValue('refresh_summary'))->toBe($payload);
});
