<?php

use App\Events\Runs\RunStarted;
use App\Models\Run;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

it('broadcasts on the private runs.{id} channel', function () {
    $run = Run::factory()->create();

    $event = new RunStarted($run);
    $channels = $event->broadcastOn();

    expect($channels)->toHaveCount(1);
    expect($channels[0])->toBeInstanceOf(PrivateChannel::class);
    expect($channels[0]->name)->toBe("private-runs.{$run->id}");
});

it('exposes the spec-mandated fields in broadcastWith()', function () {
    $run = Run::factory()->create();

    $payload = (new RunStarted($run))->broadcastWith();

    expect($payload)->toHaveKey('run_id');
    expect($payload)->toHaveKey('thread_id');
    expect($payload)->toHaveKey('model_id');
    expect($payload)->toHaveKey('started_at');
    expect($payload['run_id'])->toBe($run->id);
    expect($payload['thread_id'])->toBe($run->thread_id);
    expect($payload['model_id'])->toBe($run->model_id);
});

it('implements the ShouldBroadcast contract so the broadcast layer picks it up', function () {
    $run = Run::factory()->create();
    $event = new RunStarted($run);

    expect($event)->toBeInstanceOf(ShouldBroadcast::class);
});

it('actually dispatches through the broadcast layer when Event::fake() is active', function () {
    Event::fake([RunStarted::class]);
    $run = Run::factory()->create();

    RunStarted::dispatch($run);

    Event::assertDispatched(RunStarted::class, fn (RunStarted $e) => $e->run->is($run));
});

it('serializes the Run model so the queued broadcast can rehydrate it', function () {
    // SerializesModels trait stores only the model id+class; verifies the
    // event survives a queue round-trip without bloating the payload with
    // the full row.
    $run = Run::factory()->create();
    $event = new RunStarted($run);

    $serialized = serialize($event);
    $rehydrated = unserialize($serialized);

    expect($rehydrated)->toBeInstanceOf(RunStarted::class);
    expect($rehydrated->run->id)->toBe($run->id);
});
