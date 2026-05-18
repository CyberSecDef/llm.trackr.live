<?php

use App\Enums\ArchitectureType;
use App\Models\LlmModel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

it('renders the admin model index for an admin', function () {
    $admin = User::factory()->admin()->create();
    LlmModel::factory()->count(3)->create();

    $response = $this->actingAs($admin)->get('/admin/models');

    $response->assertStatus(200);
    $response->assertSee('"component":"Admin\/Models\/Index"', escape: false);
    $response->assertSee('"total":3', escape: false);
});

it('rejects non-admin access to the model registry', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/admin/models')->assertForbidden();
});

it('filters the model list by vendor', function () {
    $admin = User::factory()->admin()->create();
    LlmModel::factory()->vendor('openai')->count(2)->create();
    LlmModel::factory()->vendor('anthropic')->count(3)->create();

    $response = $this->actingAs($admin)->get('/admin/models?vendor=anthropic');

    $response->assertSee('"total":3', escape: false);
});

it('filters the model list by search across name and display_name', function () {
    $admin = User::factory()->admin()->create();
    LlmModel::factory()->create(['name' => 'gpt-4o', 'display_name' => 'GPT-4o']);
    LlmModel::factory()->create(['name' => 'claude-3-5-sonnet', 'display_name' => 'Claude 3.5 Sonnet']);

    $response = $this->actingAs($admin)->get('/admin/models?search=claude');

    $response->assertSee('"total":1', escape: false);
    $response->assertSee('claude-3-5-sonnet', escape: false);
});

it('filters by architecture type', function () {
    $admin = User::factory()->admin()->create();
    LlmModel::factory()->count(2)->create(['architecture_type' => ArchitectureType::Dense]);
    LlmModel::factory()->moe()->count(3)->create();

    $response = $this->actingAs($admin)->get('/admin/models?architecture=moe');

    $response->assertSee('"total":3', escape: false);
});

it('paginates at 25 per page', function () {
    $admin = User::factory()->admin()->create();
    LlmModel::factory()->count(30)->create();

    $this->actingAs($admin)
        ->get('/admin/models')
        ->assertSee('"total":30', escape: false)
        ->assertSee('"last_page":2', escape: false);
});

it('renders the edit form for a specific model', function () {
    $admin = User::factory()->admin()->create();
    $model = LlmModel::factory()->create(['name' => 'gpt-4o']);

    $response = $this->actingAs($admin)->get("/admin/models/{$model->id}/edit");

    $response->assertStatus(200);
    $response->assertSee('"component":"Admin\/Models\/Edit"', escape: false);
    $response->assertSee('gpt-4o', escape: false);
    $response->assertSee('"architectureTypes":["dense","moe"]', escape: false);
});

it('updates a model from the edit form', function () {
    $admin = User::factory()->admin()->create();
    $model = LlmModel::factory()->create([
        'display_name' => 'Old Name',
        'context_length' => 64000,
        'manual_override' => false,
    ]);

    $this->actingAs($admin)
        ->patch("/admin/models/{$model->id}", [
            'vendor' => $model->vendor,
            'display_name' => 'New Name',
            'context_length' => 128000,
            'supports_streaming' => true,
            'supports_logprobs' => false,
            'supports_seed' => false,
            'manual_override' => true,
        ])
        ->assertRedirect(route('admin.models.index'))
        ->assertSessionHas('status', "model-updated:{$model->id}");

    $fresh = $model->fresh();
    expect($fresh->display_name)->toBe('New Name');
    expect($fresh->context_length)->toBe(128000);
    expect($fresh->manual_override)->toBeTrue();
});

it('rejects invalid update payload', function () {
    $admin = User::factory()->admin()->create();
    $model = LlmModel::factory()->create();

    $this->actingAs($admin)
        ->patch("/admin/models/{$model->id}", [
            'vendor' => '',
            'architecture_type' => 'invalid-arch',
            'supports_streaming' => true,
            'supports_logprobs' => false,
            'supports_seed' => false,
            'manual_override' => false,
        ])
        ->assertSessionHasErrors(['vendor', 'architecture_type']);
});

it('rejects non-admin updates', function () {
    $user = User::factory()->create();
    $model = LlmModel::factory()->create(['context_length' => 64000]);

    $this->actingAs($user)
        ->patch("/admin/models/{$model->id}", [
            'vendor' => 'attacker',
            'context_length' => 999,
            'supports_streaming' => true,
            'supports_logprobs' => false,
            'supports_seed' => false,
            'manual_override' => false,
        ])
        ->assertForbidden();

    expect($model->fresh()->context_length)->toBe(64000);
});

it('deletes a model', function () {
    $admin = User::factory()->admin()->create();
    $model = LlmModel::factory()->create(['name' => 'doomed']);

    $this->actingAs($admin)
        ->delete("/admin/models/{$model->id}")
        ->assertRedirect(route('admin.models.index'))
        ->assertSessionHas('status', 'model-deleted:doomed');

    expect(LlmModel::find($model->id))->toBeNull();
});

it('rejects non-admin deletes', function () {
    $user = User::factory()->create();
    $model = LlmModel::factory()->create();

    $this->actingAs($user)
        ->delete("/admin/models/{$model->id}")
        ->assertForbidden();

    expect(LlmModel::find($model->id))->not->toBeNull();
});

it('triggers a refresh via POST /admin/models/refresh', function () {
    Http::fake([
        '*/api/v1/models' => Http::response([
            'data' => [
                ['id' => 'openai/gpt-4o', 'name' => 'GPT-4o', 'context_length' => 128000, 'pricing' => ['prompt' => '0', 'completion' => '0']],
            ],
        ]),
    ]);

    $admin = User::factory()->admin()->create();

    $this->actingAs($admin)
        ->post('/admin/models/refresh')
        ->assertRedirect(route('admin.models.index'));

    expect(LlmModel::where('name', 'gpt-4o')->exists())->toBeTrue();
});

it('surfaces refresh failures via flash errors', function () {
    Http::fake([
        '*/api/v1/models' => Http::response('Service Unavailable', 503),
    ]);

    $admin = User::factory()->admin()->create();

    $response = $this->actingAs($admin)->post('/admin/models/refresh');

    $response->assertRedirect(route('admin.models.index'));
    $response->assertSessionHasErrors('refresh');
});

it('rejects non-admin refresh attempts', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post('/admin/models/refresh')
        ->assertForbidden();
});

it('redirects authenticated admins from /models to /admin/models', function () {
    $admin = User::factory()->admin()->create();

    $this->actingAs($admin)
        ->get('/models')
        ->assertRedirect(route('admin.models.index'));
});

it('keeps /models as the ComingSoon placeholder for non-admins', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/models');

    $response->assertStatus(200);
    $response->assertSee('"component":"ComingSoon"', escape: false);
    $response->assertSee('"milestone":"M7"', escape: false);
});
