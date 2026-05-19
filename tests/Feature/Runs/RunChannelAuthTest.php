<?php

use App\Models\Run;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Channel authorization for `private-runs.{run_id}` (M6 chunk 4a).
 *
 * Tests hit `/broadcasting/auth` — the endpoint Laravel auto-registers
 * via `withRouting(channels: ...)` in bootstrap/app.php. The real
 * pusher-js client posts the channel name + socket_id here; on 200
 * Laravel signs the channel name with the broadcasting secret and the
 * client uses that signature to subscribe.
 *
 * A 403 from this endpoint is exactly what we want for unauthorized
 * users — pusher-js surfaces it as a subscription failure on the
 * frontend, and the events never reach the wrong browser.
 *
 * Test env uses BROADCAST_CONNECTION=pusher (see phpunit.xml) so the
 * registered channel callback actually runs — the default `log` driver
 * no-ops on auth() and returns 403 for everything.
 */

it('authorizes the run owner on their channel', function () {
    $user = User::factory()->create();
    $run = Run::factory()->for($user)->create();

    $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => "private-runs.{$run->id}",
    ]);

    $response->assertOk();
});

it('rejects a non-owner trying to subscribe to a run channel', function () {
    $owner = User::factory()->create();
    $stranger = User::factory()->create();
    $run = Run::factory()->for($owner)->create();

    $response = $this->actingAs($stranger)->postJson('/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => "private-runs.{$run->id}",
    ]);

    $response->assertForbidden();
});

it('rejects subscription to a nonexistent run', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => 'private-runs.999999',
    ]);

    $response->assertForbidden();
});

it('rejects unauthenticated subscription attempts', function () {
    $user = User::factory()->create();
    $run = Run::factory()->for($user)->create();

    $response = $this->postJson('/broadcasting/auth', [
        'socket_id' => '123.456',
        'channel_name' => "private-runs.{$run->id}",
    ]);

    // Unauthenticated requests on the broadcasting/auth route get
    // bounced by the 'web' auth middleware before they ever reach
    // the channel closure.
    $response->assertStatus(403);
});
