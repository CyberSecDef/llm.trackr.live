<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\Runs\RunReplayEventSynthesizer;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * SPEC §10.1 invariant: two replays of the same run produce the
 * frame-identical animation. At the data layer, that means two
 * invocations of RunReplayEventSynthesizer must produce byte-equal
 * arrays — including the MoE expert routing whose hash is seeded
 * by (run.id, token_index).
 *
 * Frontend determinism (cursor advancement under fake timers,
 * deterministic ParticleSystem.spawnBurst seeded by burstForToken)
 * is covered by the Vitest suite; this Pest file owns the backend
 * end of the contract.
 */

function moeReplayRun(int $tokens = 5): Run
{
    $log = [];
    for ($i = 0; $i < $tokens; $i++) {
        $log[] = [
            'token' => "tok{$i}",
            'index' => $i,
            't_ms' => 100 * ($i + 1),
            'logprobs' => null,
        ];
    }

    return Run::factory()->create([
        'status' => RunStatus::Complete,
        'parameters' => [
            'model_snapshot' => [
                'architecture_type' => 'moe',
                'layers' => 32,
                'moe_experts' => 8,
                'moe_active_experts' => 2,
            ],
        ],
        'token_log' => $log,
        'output_tokens' => $tokens,
        'duration_ms' => 100 * $tokens,
    ]);
}

describe('Replay determinism (SPEC §10.1)', function () {
    it('two synthesizer instances over the same run produce byte-equal events', function () {
        $run = moeReplayRun(7);
        $a = (new RunReplayEventSynthesizer($run))->build();
        $b = (new RunReplayEventSynthesizer($run))->build();
        expect($a)->toEqual($b);
    });

    it('repeated build() calls on the same instance produce equal events', function () {
        $run = moeReplayRun(7);
        $synth = new RunReplayEventSynthesizer($run);
        $a = $synth->build();
        $b = $synth->build();
        $c = $synth->build();
        expect($a)->toEqual($b);
        expect($b)->toEqual($c);
    });

    it('MoE expert routing is deterministic per (run.id, token_index)', function () {
        // Same run.id → same expert IDs in identical positions across builds.
        $run = moeReplayRun(20);
        $events = (new RunReplayEventSynthesizer($run))->build();
        $moe = array_values(array_filter(
            $events,
            fn ($e) => $e['event'] === 'moe.routed',
        ));

        // Capture for later comparison.
        $expertsByToken = [];
        foreach ($moe as $event) {
            $expertsByToken[$event['payload']['token_index']] = $event['payload']['experts'];
        }

        // Build again — same answer.
        $events2 = (new RunReplayEventSynthesizer($run))->build();
        $moe2 = array_values(array_filter(
            $events2,
            fn ($e) => $e['event'] === 'moe.routed',
        ));
        foreach ($moe2 as $event) {
            $idx = $event['payload']['token_index'];
            expect($event['payload']['experts'])->toEqual($expertsByToken[$idx]);
        }
    });

    it('different runs with the same token_log produce different expert routing', function () {
        // The MoE hash is seeded by (run.id, token_index). Two runs
        // with different IDs must produce different routing even
        // when their token_log is byte-equal.
        $log = [];
        for ($i = 0; $i < 10; $i++) {
            $log[] = [
                'token' => "tok{$i}",
                'index' => $i,
                't_ms' => 100,
                'logprobs' => null,
            ];
        }
        $params = [
            'model_snapshot' => [
                'architecture_type' => 'moe',
                'layers' => 32,
                'moe_experts' => 8,
                'moe_active_experts' => 2,
            ],
        ];
        $runA = Run::factory()->create([
            'status' => RunStatus::Complete,
            'parameters' => $params,
            'token_log' => $log,
        ]);
        $runB = Run::factory()->create([
            'status' => RunStatus::Complete,
            'parameters' => $params,
            'token_log' => $log,
        ]);

        $aMoe = array_values(array_filter(
            (new RunReplayEventSynthesizer($runA))->build(),
            fn ($e) => $e['event'] === 'moe.routed',
        ));
        $bMoe = array_values(array_filter(
            (new RunReplayEventSynthesizer($runB))->build(),
            fn ($e) => $e['event'] === 'moe.routed',
        ));

        // At least one token has different expert IDs between the runs.
        $diff = false;
        for ($i = 0; $i < count($aMoe); $i++) {
            if ($aMoe[$i]['payload']['experts'] !== $bMoe[$i]['payload']['experts']) {
                $diff = true;
                break;
            }
        }
        expect($diff)->toBeTrue();
    });

    it('layer.advanced events fire deterministically (token_index + total_layers stable)', function () {
        $run = moeReplayRun(8);
        $a = (new RunReplayEventSynthesizer($run))->build();
        $aLayers = array_values(array_filter(
            $a,
            fn ($e) => $e['event'] === 'layer.advanced',
        ));
        foreach ($aLayers as $i => $event) {
            expect($event['payload']['token_index'])->toBe($i);
            expect($event['payload']['total_layers'])->toBe(32);
        }
    });

    it('event ordering is stable: started → (token + layer + moe per token) → completed', function () {
        $run = moeReplayRun(3);
        $events = (new RunReplayEventSynthesizer($run))->build();

        $expected = [
            'run.started',
            'token.received', 'layer.advanced', 'moe.routed',
            'token.received', 'layer.advanced', 'moe.routed',
            'token.received', 'layer.advanced', 'moe.routed',
            'run.completed',
        ];
        $actual = array_map(fn ($e) => $e['event'], $events);
        expect($actual)->toEqual($expected);
    });

    it('dense runs produce no moe.routed events regardless of token count', function () {
        $log = array_map(
            fn ($i) => ['token' => "t{$i}", 'index' => $i, 't_ms' => 100, 'logprobs' => null],
            range(0, 9),
        );
        $run = Run::factory()->create([
            'status' => RunStatus::Complete,
            'parameters' => [
                'model_snapshot' => ['architecture_type' => 'dense', 'layers' => 32],
            ],
            'token_log' => $log,
        ]);
        $events = (new RunReplayEventSynthesizer($run))->build();
        $moe = array_filter($events, fn ($e) => $e['event'] === 'moe.routed');
        expect($moe)->toBeEmpty();
    });

    it('logprobs in token.received payloads are preserved verbatim across replays', function () {
        $log = [[
            'token' => 'Hello',
            'index' => 0,
            't_ms' => 100,
            'logprobs' => [
                ['token' => 'Hello', 'logprob' => -0.1],
                ['token' => 'Hi', 'logprob' => -2.3],
            ],
        ]];
        $run = Run::factory()->create([
            'status' => RunStatus::Complete,
            'parameters' => ['model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12]],
            'token_log' => $log,
        ]);
        $a = (new RunReplayEventSynthesizer($run))->build();
        $b = (new RunReplayEventSynthesizer($run))->build();

        $tokenA = array_values(array_filter($a, fn ($e) => $e['event'] === 'token.received'))[0];
        $tokenB = array_values(array_filter($b, fn ($e) => $e['event'] === 'token.received'))[0];
        expect($tokenA['payload']['logprobs'])->toEqual($tokenB['payload']['logprobs']);
        expect($tokenA['payload']['logprobs'][0]['logprob'])->toBe(-0.1);
    });
});
