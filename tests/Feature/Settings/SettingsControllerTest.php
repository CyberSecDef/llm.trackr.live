<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('shows the current store_prompts value for the signed-in user', function () {
    $user = User::factory()->create(['store_prompts' => false]);

    $this->actingAs($user)
        ->get('/settings')
        ->assertStatus(200)
        ->assertSee('"storePrompts":false', escape: false);
});

it('updates store_prompts when the user submits the form', function () {
    $user = User::factory()->create(['store_prompts' => true]);

    $this->actingAs($user)
        ->patch('/settings', ['store_prompts' => false])
        ->assertRedirect(route('settings'))
        ->assertSessionHas('status', 'settings-saved');

    expect($user->fresh()->store_prompts)->toBeFalse();
});

it('validates store_prompts as a boolean', function () {
    $user = User::factory()->create(['store_prompts' => true]);

    $this->actingAs($user)
        ->patch('/settings', ['store_prompts' => 'not-a-bool'])
        ->assertSessionHasErrors('store_prompts');

    expect($user->fresh()->store_prompts)->toBeTrue();
});

it('rejects unauthenticated PATCH /settings', function () {
    $this->patch('/settings', ['store_prompts' => false])
        ->assertRedirect('/login');
});
