<?php

use App\Models\ApiKey;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('renders the api keys index for the signed-in user only', function () {
    $alice = User::factory()->create();
    $bob = User::factory()->create();
    ApiKey::factory()->for($alice)->vendor('openai')->count(2)->create();
    ApiKey::factory()->for($bob)->vendor('anthropic')->count(1)->create();

    $response = $this->actingAs($alice)->get('/api-keys');

    $response->assertStatus(200);
    $response->assertSee('"component":"ApiKeys\/Index"', escape: false);
    // 2 of Alice's keys serialized, Bob's not visible
    $json = $response->getContent();
    expect(substr_count($json, '"vendor":"openai"'))->toBeGreaterThanOrEqual(2);
    expect($json)->not->toContain('"vendor":"anthropic"');
});

it('returns the supported vendors list for the picker', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/api-keys');

    foreach (['openai', 'anthropic', 'google', 'xai', 'mistral', 'groq', 'together', 'huggingface'] as $v) {
        $response->assertSee($v, escape: false);
    }
});

it('rejects unauthenticated /api-keys access', function () {
    $this->get('/api-keys')->assertRedirect('/login');
});

it('stores a new api key for the user', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post('/api-keys', [
            'vendor' => 'openai',
            'label' => 'personal',
            'key' => 'sk-test-1234567890abcdef',
        ])
        ->assertRedirect(route('api-keys.index'))
        ->assertSessionHas('status', 'api-key-added');

    $key = $user->apiKeys()->first();
    expect($key->vendor)->toBe('openai');
    expect($key->label)->toBe('personal');
    expect($key->encrypted_key)->toBe('sk-test-1234567890abcdef');
    expect($key->last_four)->toBe('cdef');
});

it('validates the vendor against the supported list', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post('/api-keys', [
            'vendor' => 'unknown-vendor',
            'key' => 'sk-test-1234567890abcdef',
        ])
        ->assertSessionHasErrors('vendor');
});

it('validates that the key is non-trivial', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post('/api-keys', [
            'vendor' => 'openai',
            'key' => 'short',
        ])
        ->assertSessionHasErrors('key');
});

it('rejects a duplicate (vendor, label) with a friendly error', function () {
    $user = User::factory()->create();
    ApiKey::factory()->for($user)->vendor('openai')->withLabel('work')->create();

    $this->actingAs($user)
        ->post('/api-keys', [
            'vendor' => 'openai',
            'label' => 'work',
            'key' => 'sk-different-key-1234567890',
        ])
        ->assertSessionHasErrors('label');

    expect($user->apiKeys()->count())->toBe(1);
});

it('allows the same vendor with a different label for the same user', function () {
    $user = User::factory()->create();
    ApiKey::factory()->for($user)->vendor('openai')->withLabel('work')->create();

    $this->actingAs($user)
        ->post('/api-keys', [
            'vendor' => 'openai',
            'label' => 'personal',
            'key' => 'sk-test-different-1234567890',
        ])
        ->assertRedirect();

    expect($user->apiKeys()->count())->toBe(2);
});

it('treats null label distinctly from labeled keys', function () {
    $user = User::factory()->create();
    ApiKey::factory()->for($user)->vendor('openai')->withLabel(null)->create();

    $this->actingAs($user)
        ->post('/api-keys', [
            'vendor' => 'openai',
            'label' => 'work',
            'key' => 'sk-test-labeled-1234567890',
        ])
        ->assertRedirect();

    expect($user->apiKeys()->count())->toBe(2);
});

it('lets a user delete their own key', function () {
    $user = User::factory()->create();
    $key = ApiKey::factory()->for($user)->vendor('openai')->create();

    $this->actingAs($user)
        ->delete("/api-keys/{$key->id}")
        ->assertRedirect(route('api-keys.index'))
        ->assertSessionHas('status', 'api-key-deleted:openai');

    expect(ApiKey::find($key->id))->toBeNull();
});

it('forbids deleting another user\'s key', function () {
    $alice = User::factory()->create();
    $bob = User::factory()->create();
    $bobsKey = ApiKey::factory()->for($bob)->create();

    $this->actingAs($alice)
        ->delete("/api-keys/{$bobsKey->id}")
        ->assertForbidden();

    expect(ApiKey::find($bobsKey->id))->not->toBeNull();
});

it('never returns the plaintext key in the JSON payload', function () {
    $user = User::factory()->create();
    ApiKey::factory()->for($user)->withKey('sk-supersecret-abcdef1234567890')->create();

    $response = $this->actingAs($user)->get('/api-keys');

    expect($response->getContent())->not->toContain('supersecret');
    // Inertia's page payload is JSON-encoded inside the HTML response,
    // and json_encode emits non-ASCII glyphs as \uXXXX escapes by default
    // — so the • bullets surface as • in the response body.
    expect($response->getContent())->toContain('\\u2022\\u2022\\u2022\\u20227890');
    expect($response->getContent())->toContain('"last_four":"7890"');
});
