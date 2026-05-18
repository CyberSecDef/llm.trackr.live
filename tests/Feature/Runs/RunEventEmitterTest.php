<?php

use App\Events\Runs\LayerAdvanced;
use App\Events\Runs\MoeRouted;
use App\Events\Runs\RunCompleted;
use App\Events\Runs\RunErrored;
use App\Events\Runs\TokenReceived;
use App\Models\Run;
use App\Services\Llm\LlmTokenChunk;
use App\Services\Runs\RunEventEmitter;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function denseRun(): Run
{
    return Run::factory()->create([
        'parameters' => [
            'model_snapshot' => [
                'architecture_type' => 'dense',
                'layers' => 80,
            ],
        ],
    ]);
}

function moeRun(int $experts = 8, int $active = 2): Run
{
    return Run::factory()->create([
        'parameters' => [
            'model_snapshot' => [
                'architecture_type' => 'moe',
                'layers' => 56,
                'moe_experts' => $experts,
                'moe_active_experts' => $active,
            ],
        ],
    ]);
}

describe('eventsForChunk', function () {
    it('emits TokenReceived + LayerAdvanced for a dense model', function () {
        $emitter = new RunEventEmitter(denseRun());
        $chunk = new LlmTokenChunk(text: 'Hello', index: 0);

        $events = $emitter->eventsForChunk($chunk, tokenIndex: 0, tMs: 100);

        expect($events)->toHaveCount(2);
        expect($events[0])->toBeInstanceOf(TokenReceived::class);
        expect($events[1])->toBeInstanceOf(LayerAdvanced::class);
    });

    it('emits TokenReceived + LayerAdvanced + MoeRouted for an MoE model', function () {
        $emitter = new RunEventEmitter(moeRun());
        $chunk = new LlmTokenChunk(text: 'Hi', index: 0);

        $events = $emitter->eventsForChunk($chunk, tokenIndex: 0, tMs: 50);

        expect($events)->toHaveCount(3);
        expect($events[0])->toBeInstanceOf(TokenReceived::class);
        expect($events[1])->toBeInstanceOf(LayerAdvanced::class);
        expect($events[2])->toBeInstanceOf(MoeRouted::class);
    });

    it('TokenReceived carries text, index, t_ms, logprobs, isFinal', function () {
        $emitter = new RunEventEmitter(denseRun());
        $chunk = new LlmTokenChunk(
            text: ' world',
            index: 5,
            logprobs: [['token' => ' world', 'logprob' => -0.4]],
            isFinal: true,
        );

        $events = $emitter->eventsForChunk($chunk, tokenIndex: 5, tMs: 250);

        $token = $events[0];
        expect($token->token)->toBe(' world');
        expect($token->index)->toBe(5);
        expect($token->tMs)->toBe(250);
        expect($token->logprobs)->toBe([['token' => ' world', 'logprob' => -0.4]]);
        expect($token->isFinal)->toBeTrue();
    });

    it('LayerAdvanced carries total_layers from the model snapshot', function () {
        $emitter = new RunEventEmitter(denseRun());

        $events = $emitter->eventsForChunk(new LlmTokenChunk(text: 'a'), 0, 1);

        expect($events[1]->totalLayers)->toBe(80);
    });

    it('LayerAdvanced totalLayers is null when the snapshot lacks the field', function () {
        $run = Run::factory()->create(['parameters' => ['model_snapshot' => []]]);
        $emitter = new RunEventEmitter($run);

        $events = $emitter->eventsForChunk(new LlmTokenChunk(text: 'a'), 0, 1);

        expect($events[1]->totalLayers)->toBeNull();
    });

    it('MoE expert selection is deterministic given (run.id, token_index)', function () {
        $run = moeRun(experts: 8, active: 2);

        $emitterA = new RunEventEmitter($run);
        $emitterB = new RunEventEmitter($run);

        $eventsA = $emitterA->eventsForChunk(new LlmTokenChunk(text: 'a'), tokenIndex: 7, tMs: 1);
        $eventsB = $emitterB->eventsForChunk(new LlmTokenChunk(text: 'a'), tokenIndex: 7, tMs: 1);

        $moeA = $eventsA[2];
        $moeB = $eventsB[2];

        expect($moeA->experts)->toBe($moeB->experts);
        expect($moeA->scores)->toBe($moeB->scores);
    });

    it('MoE expert selection varies across token_index', function () {
        $emitter = new RunEventEmitter(moeRun());

        $selections = [];
        for ($i = 0; $i < 10; $i++) {
            $events = $emitter->eventsForChunk(new LlmTokenChunk(text: 'x'), tokenIndex: $i, tMs: $i);
            $selections[] = $events[2]->experts;
        }

        // Not every token picks the same experts (would be a bug if so).
        expect(count(array_unique(array_map(fn ($s) => implode(',', $s), $selections))))
            ->toBeGreaterThan(1);
    });

    it('MoE selection picks the right number of active experts', function () {
        $emitter = new RunEventEmitter(moeRun(experts: 16, active: 4));
        $events = $emitter->eventsForChunk(new LlmTokenChunk(text: 'x'), 0, 0);

        expect($events[2]->experts)->toHaveCount(4);
        // All within range.
        foreach ($events[2]->experts as $e) {
            expect($e)->toBeGreaterThanOrEqual(0)->toBeLessThan(16);
        }
    });

    it('MoE expert IDs are unique within a single token', function () {
        $emitter = new RunEventEmitter(moeRun(experts: 8, active: 4));
        $events = $emitter->eventsForChunk(new LlmTokenChunk(text: 'x'), 0, 0);

        expect(array_unique($events[2]->experts))->toHaveCount(4);
    });

    it('MoE scores sum to ~1.0 with descending values', function () {
        $emitter = new RunEventEmitter(moeRun(experts: 8, active: 3));
        $events = $emitter->eventsForChunk(new LlmTokenChunk(text: 'x'), 0, 0);

        $scores = $events[2]->scores;
        expect(array_sum($scores))->toBeGreaterThan(0.99)->toBeLessThan(1.01);
        // Descending.
        expect($scores[0])->toBeGreaterThan($scores[1]);
        expect($scores[1])->toBeGreaterThan($scores[2]);
    });
});

describe('completedEvent / erroredEvent', function () {
    it('returns a RunCompleted with computed tokens_per_second', function () {
        $emitter = new RunEventEmitter(denseRun());

        $event = $emitter->completedEvent(
            inputTokens: 10,
            outputTokens: 100,
            durationMs: 2000,
            estimatedCost: 0.001,
        );

        expect($event)->toBeInstanceOf(RunCompleted::class);
        expect($event->tokensPerSecond)->toBe(50.0);
        expect($event->durationMs)->toBe(2000);
        expect($event->estimatedCost)->toBe(0.001);
    });

    it('handles zero duration gracefully', function () {
        $emitter = new RunEventEmitter(denseRun());

        $event = $emitter->completedEvent(inputTokens: 5, outputTokens: 5, durationMs: 0);

        expect($event->tokensPerSecond)->toBe(0.0);
    });

    it('returns a RunErrored with message + partial output', function () {
        $emitter = new RunEventEmitter(denseRun());

        $event = $emitter->erroredEvent('vendor 429', 'partial...');

        expect($event)->toBeInstanceOf(RunErrored::class);
        expect($event->message)->toBe('vendor 429');
        expect($event->partialOutput)->toBe('partial...');
    });
});
