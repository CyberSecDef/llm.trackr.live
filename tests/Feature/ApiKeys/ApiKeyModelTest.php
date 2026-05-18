<?php

use App\Models\ApiKey;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('encrypts the key at rest', function () {
    $user = User::factory()->create();
    $plaintext = 'sk-supersecret-abcdef123456';

    $key = ApiKey::factory()->for($user)->withKey($plaintext)->create();

    // Reload via Eloquent: cast decrypts transparently.
    expect($key->fresh()->encrypted_key)->toBe($plaintext);

    // Raw row: ciphertext on disk doesn't contain the plaintext.
    $raw = DB::table('api_keys')->where('id', $key->id)->first();
    expect($raw->encrypted_key)->not->toBe($plaintext);
    expect($raw->encrypted_key)->not->toContain('supersecret');
});

it('caches the last four plaintext characters on save', function () {
    $user = User::factory()->create();

    $key = ApiKey::factory()->for($user)->withKey('sk-1234567890wxyz')->create();

    expect($key->last_four)->toBe('wxyz');
    expect($key->maskedDisplay())->toBe('••••wxyz');
});

it('recomputes last_four when the key is updated', function () {
    $user = User::factory()->create();
    $key = ApiKey::factory()->for($user)->withKey('sk-aaaaaaaaaaaaaaaa')->create();
    expect($key->last_four)->toBe('aaaa');

    $key->encrypted_key = 'sk-bbbbbbbbbbbbbbbb';
    $key->save();

    expect($key->fresh()->last_four)->toBe('bbbb');
});

it('hides encrypted_key from array/JSON serialization', function () {
    $key = ApiKey::factory()->withKey('sk-secret-12345678')->create();

    expect($key->toArray())->not->toHaveKey('encrypted_key');
});

it('cascades on user delete', function () {
    $user = User::factory()->create();
    ApiKey::factory()->for($user)->count(3)->create();
    expect(ApiKey::count())->toBe(3);

    $user->delete();

    expect(ApiKey::count())->toBe(0);
});

it('enforces unique (user_id, vendor, label)', function () {
    $user = User::factory()->create();
    ApiKey::factory()->for($user)->vendor('openai')->withLabel('work')->create();

    expect(fn () => ApiKey::factory()->for($user)->vendor('openai')->withLabel('work')->create())
        ->toThrow(UniqueConstraintViolationException::class);
});

it('allows the same vendor and label across different users', function () {
    $alice = User::factory()->create();
    $bob = User::factory()->create();

    ApiKey::factory()->for($alice)->vendor('openai')->withLabel('default')->create();
    ApiKey::factory()->for($bob)->vendor('openai')->withLabel('default')->create();

    expect(ApiKey::count())->toBe(2);
});

it('allows multiple keys per vendor under different labels', function () {
    $user = User::factory()->create();

    ApiKey::factory()->for($user)->vendor('openai')->withLabel('personal')->create();
    ApiKey::factory()->for($user)->vendor('openai')->withLabel('work')->create();

    expect($user->apiKeys()->where('vendor', 'openai')->count())->toBe(2);
});

it('updates last_used_at via touchUsed()', function () {
    $key = ApiKey::factory()->create(['last_used_at' => null]);

    $key->touchUsed();

    expect($key->fresh()->last_used_at)->not->toBeNull();
});
