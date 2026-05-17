<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('lists users for an admin', function () {
    $admin = User::factory()->admin()->create();
    User::factory()->count(3)->create();

    $response = $this->actingAs($admin)->get('/admin/users');

    $response->assertStatus(200);
    $response->assertSee('"component":"Admin\/Users"', escape: false);
    // 4 users total: the admin + 3 others
    $response->assertSee('"total":4', escape: false);
});

it('paginates at 20 per page', function () {
    $admin = User::factory()->admin()->create();
    User::factory()->count(25)->create();

    $this->actingAs($admin)
        ->get('/admin/users')
        ->assertSee('"total":26', escape: false)
        ->assertSee('"last_page":2', escape: false);
});

it('rejects non-admin access to the user list', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/admin/users')->assertForbidden();
});

it('lets an admin update max_runs_per_hour for any user', function () {
    $admin = User::factory()->admin()->create();
    $target = User::factory()->create(['max_runs_per_hour' => 30]);

    $this->actingAs($admin)
        ->patch("/admin/users/{$target->id}", ['max_runs_per_hour' => 200])
        ->assertRedirect(route('admin.users.index'))
        ->assertSessionHas('status', "rate-limit-updated:{$target->id}");

    expect($target->fresh()->max_runs_per_hour)->toBe(200);
});

it('rejects max_runs_per_hour below 0', function () {
    $admin = User::factory()->admin()->create();
    $target = User::factory()->create(['max_runs_per_hour' => 30]);

    $this->actingAs($admin)
        ->patch("/admin/users/{$target->id}", ['max_runs_per_hour' => -1])
        ->assertSessionHasErrors('max_runs_per_hour');

    expect($target->fresh()->max_runs_per_hour)->toBe(30);
});

it('rejects max_runs_per_hour above 10000', function () {
    $admin = User::factory()->admin()->create();
    $target = User::factory()->create(['max_runs_per_hour' => 30]);

    $this->actingAs($admin)
        ->patch("/admin/users/{$target->id}", ['max_runs_per_hour' => 10001])
        ->assertSessionHasErrors('max_runs_per_hour');

    expect($target->fresh()->max_runs_per_hour)->toBe(30);
});

it('rejects non-admin PATCH attempts to update other users', function () {
    $user = User::factory()->create();
    $target = User::factory()->create(['max_runs_per_hour' => 30]);

    $this->actingAs($user)
        ->patch("/admin/users/{$target->id}", ['max_runs_per_hour' => 999])
        ->assertForbidden();

    expect($target->fresh()->max_runs_per_hour)->toBe(30);
});
