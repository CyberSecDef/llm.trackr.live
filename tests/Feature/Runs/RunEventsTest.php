<?php

use App\Events\Runs\LayerAdvanced;
use App\Events\Runs\MoeRouted;
use App\Events\Runs\RunCompleted;
use App\Events\Runs\RunErrored;
use App\Events\Runs\TokenReceived;
use App\Models\Run;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

describe('TokenReceived', function () {
    it('broadcasts on the private runs.{id} channel', function () {
        $run = Run::factory()->create();
        $event = new TokenReceived(run: $run, token: 'Hello', index: 0, tMs: 100);

        $channels = $event->broadcastOn();
        expect($channels)->toHaveCount(1);
        expect($channels[0])->toBeInstanceOf(PrivateChannel::class);
        expect($channels[0]->name)->toBe("private-runs.{$run->id}");
    });

    it('carries token + index + t_ms + logprobs in broadcastWith()', function () {
        $run = Run::factory()->create();
        $event = new TokenReceived(
            run: $run,
            token: 'Hello',
            index: 5,
            tMs: 250,
            logprobs: [['token' => 'Hello', 'logprob' => -0.5]],
            isFinal: false,
        );

        $payload = $event->broadcastWith();
        expect($payload['run_id'])->toBe($run->id);
        expect($payload['token'])->toBe('Hello');
        expect($payload['index'])->toBe(5);
        expect($payload['t_ms'])->toBe(250);
        expect($payload['logprobs'])->toBe([['token' => 'Hello', 'logprob' => -0.5]]);
        expect($payload['is_final'])->toBeFalse();
    });

    it('allows null logprobs for vendors that do not expose them', function () {
        $event = new TokenReceived(run: Run::factory()->create(), token: 'x', index: 0, tMs: 1);
        expect($event->broadcastWith()['logprobs'])->toBeNull();
    });

    it('implements ShouldBroadcast', function () {
        $event = new TokenReceived(run: Run::factory()->create(), token: 'x', index: 0, tMs: 1);
        expect($event)->toBeInstanceOf(ShouldBroadcast::class);
    });
});

describe('LayerAdvanced', function () {
    it('broadcasts on the private channel + carries total_layers from the snapshot', function () {
        $run = Run::factory()->create();
        $event = new LayerAdvanced(run: $run, tokenIndex: 3, totalLayers: 80);

        expect($event->broadcastOn()[0]->name)->toBe("private-runs.{$run->id}");
        expect($event->broadcastWith())->toBe([
            'run_id' => $run->id,
            'token_index' => 3,
            'total_layers' => 80,
        ]);
    });

    it('handles unknown layer counts (null total_layers)', function () {
        $run = Run::factory()->create();
        $event = new LayerAdvanced(run: $run, tokenIndex: 0, totalLayers: null);
        expect($event->broadcastWith()['total_layers'])->toBeNull();
    });
});

describe('MoeRouted', function () {
    it('carries the expert IDs + scores in broadcastWith()', function () {
        $run = Run::factory()->create();
        $event = new MoeRouted(
            run: $run,
            tokenIndex: 2,
            experts: [3, 7],
            scores: [0.6667, 0.3333],
        );

        expect($event->broadcastWith())->toBe([
            'run_id' => $run->id,
            'token_index' => 2,
            'experts' => [3, 7],
            'scores' => [0.6667, 0.3333],
        ]);
    });
});

describe('RunCompleted', function () {
    it('carries final usage stats', function () {
        $run = Run::factory()->create();
        $event = new RunCompleted(
            run: $run,
            inputTokens: 50,
            outputTokens: 200,
            durationMs: 3500,
            tokensPerSecond: 57.14,
            estimatedCost: 0.0042,
        );

        expect($event->broadcastWith())->toBe([
            'run_id' => $run->id,
            'input_tokens' => 50,
            'output_tokens' => 200,
            'duration_ms' => 3500,
            'tokens_per_second' => 57.14,
            'estimated_cost' => 0.0042,
        ]);
    });

    it('allows null estimated_cost', function () {
        $event = new RunCompleted(
            run: Run::factory()->create(),
            inputTokens: 1,
            outputTokens: 1,
            durationMs: 100,
            tokensPerSecond: 10.0,
            estimatedCost: null,
        );
        expect($event->broadcastWith()['estimated_cost'])->toBeNull();
    });
});

describe('RunErrored', function () {
    it('carries the message + partial_output', function () {
        $run = Run::factory()->create();
        $event = new RunErrored(
            run: $run,
            message: 'Vendor rate-limited',
            partialOutput: 'Partial response so far...',
        );

        expect($event->broadcastWith())->toBe([
            'run_id' => $run->id,
            'message' => 'Vendor rate-limited',
            'partial_output' => 'Partial response so far...',
        ]);
    });

    it('allows null partial_output when the stream died before yielding anything', function () {
        $event = new RunErrored(run: Run::factory()->create(), message: 'boom');
        expect($event->broadcastWith()['partial_output'])->toBeNull();
    });
});

describe('all run events', function () {
    it('implement ShouldBroadcast', function (string $class) {
        $reflection = new ReflectionClass($class);
        expect($reflection->implementsInterface(ShouldBroadcast::class))->toBeTrue();
    })->with([
        TokenReceived::class,
        LayerAdvanced::class,
        MoeRouted::class,
        RunCompleted::class,
        RunErrored::class,
    ]);
});
