<?php

use App\Events\Runs\LayerAdvanced;
use App\Events\Runs\MoeRouted;
use App\Events\Runs\RunCompleted;
use App\Events\Runs\RunErrored;
use App\Events\Runs\RunStarted;
use App\Events\Runs\TokenReceived;
use App\Models\Run;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * `broadcastAs()` lets the frontend listen with short kebab-case names
 * (`.run.started`, `.token.received`, ...) instead of full PHP class
 * paths. Locking these strings down here means renaming a PHP event
 * class won't silently break the JS subscription — the test will fail
 * first.
 *
 * Dataset closures are deferred until test-execution time (not
 * dataset-resolution time) so `Run::factory()` runs inside the
 * RefreshDatabase transaction.
 */

it('broadcasts with the expected short name', function (callable $eventFactory, string $expected) {
    expect($eventFactory()->broadcastAs())->toBe($expected);
})->with([
    'RunStarted' => [fn () => new RunStarted(Run::factory()->create()), 'run.started'],
    'TokenReceived' => [fn () => new TokenReceived(Run::factory()->create(), 'a', 0, 1), 'token.received'],
    'LayerAdvanced' => [fn () => new LayerAdvanced(Run::factory()->create(), 0, 32), 'layer.advanced'],
    'MoeRouted' => [fn () => new MoeRouted(Run::factory()->create(), 0, [0, 1], [0.6, 0.4]), 'moe.routed'],
    'RunCompleted' => [fn () => new RunCompleted(Run::factory()->create(), 1, 2, 100, 20.0, 0.001), 'run.completed'],
    'RunErrored' => [fn () => new RunErrored(Run::factory()->create(), 'oops'), 'run.errored'],
]);
