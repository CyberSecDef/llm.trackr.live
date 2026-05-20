<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\Runs\RunReplayEventSynthesizer;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function denseCompleteRun(array $tokenLog = []): Run
{
    return Run::factory()->create([
        'status' => RunStatus::Complete,
        'parameters' => [
            'model_snapshot' => [
                'architecture_type' => 'dense',
                'layers' => 80,
            ],
        ],
        'token_log' => $tokenLog,
        'input_tokens' => 10,
        'output_tokens' => count($tokenLog),
        'duration_ms' => 500,
        'estimated_cost' => 0.0001,
    ]);
}

function moeCompleteRun(array $tokenLog = []): Run
{
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
        'token_log' => $tokenLog,
        'input_tokens' => 5,
        'output_tokens' => count($tokenLog),
        'duration_ms' => 800,
        'estimated_cost' => 0.0002,
    ]);
}

function tokenEntry(string $token, int $index, int $tMs): array
{
    return [
        'token' => $token,
        'index' => $index,
        't_ms' => $tMs,
        'logprobs' => null,
    ];
}

describe('RunReplayEventSynthesizer', function () {
    it('emits run.started first and run.completed last for a complete run', function () {
        $run = denseCompleteRun([tokenEntry('Hello', 0, 100)]);
        $events = (new RunReplayEventSynthesizer($run))->build();

        expect($events[0]['event'])->toBe('run.started');
        expect(end($events)['event'])->toBe('run.completed');
    });

    it('emits 2 events per token for a dense run (token.received + layer.advanced)', function () {
        $log = [
            tokenEntry('A', 0, 100),
            tokenEntry('B', 1, 200),
            tokenEntry('C', 2, 300),
        ];
        $run = denseCompleteRun($log);
        $events = (new RunReplayEventSynthesizer($run))->build();

        // 1 run.started + (3 tokens × 2 events) + 1 run.completed = 8
        expect($events)->toHaveCount(8);
        $tokenEvents = array_filter($events, fn ($e) => $e['event'] === 'token.received');
        $layerEvents = array_filter($events, fn ($e) => $e['event'] === 'layer.advanced');
        expect($tokenEvents)->toHaveCount(3);
        expect($layerEvents)->toHaveCount(3);
        // No moe.routed on a dense run.
        $moeEvents = array_filter($events, fn ($e) => $e['event'] === 'moe.routed');
        expect($moeEvents)->toHaveCount(0);
    });

    it('emits 3 events per token for an MoE run (adds moe.routed)', function () {
        $log = [tokenEntry('A', 0, 100), tokenEntry('B', 1, 200)];
        $run = moeCompleteRun($log);
        $events = (new RunReplayEventSynthesizer($run))->build();

        // 1 + (2 × 3) + 1 = 8
        expect($events)->toHaveCount(8);
        $moeEvents = array_filter($events, fn ($e) => $e['event'] === 'moe.routed');
        expect($moeEvents)->toHaveCount(2);
    });

    it('preserves token order across re-synthesis', function () {
        $log = [
            tokenEntry('Hello', 0, 100),
            tokenEntry(' world', 1, 200),
            tokenEntry('!', 2, 300),
        ];
        $run = denseCompleteRun($log);
        $events = (new RunReplayEventSynthesizer($run))->build();

        $tokens = array_values(array_filter(
            $events,
            fn ($e) => $e['event'] === 'token.received',
        ));
        expect($tokens[0]['payload']['token'])->toBe('Hello');
        expect($tokens[1]['payload']['token'])->toBe(' world');
        expect($tokens[2]['payload']['token'])->toBe('!');
    });

    it('is deterministic across repeated calls (MoE expert selection stable)', function () {
        $log = [tokenEntry('A', 0, 100), tokenEntry('B', 1, 200), tokenEntry('C', 2, 300)];
        $run = moeCompleteRun($log);
        $synth = new RunReplayEventSynthesizer($run);

        $a = $synth->build();
        $b = $synth->build();
        expect($a)->toEqual($b);

        $moeA = array_values(array_filter($a, fn ($e) => $e['event'] === 'moe.routed'));
        $moeB = array_values(array_filter($b, fn ($e) => $e['event'] === 'moe.routed'));
        for ($i = 0; $i < count($moeA); $i++) {
            expect($moeA[$i]['payload']['experts'])->toEqual($moeB[$i]['payload']['experts']);
            expect($moeA[$i]['payload']['scores'])->toEqual($moeB[$i]['payload']['scores']);
        }
    });

    it('emits run.errored (not run.completed) for an errored run', function () {
        $run = Run::factory()->create([
            'status' => RunStatus::Error,
            'parameters' => [
                'model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12],
            ],
            'token_log' => [tokenEntry('partial', 0, 50)],
            'error_message' => 'Vendor rate-limited',
            'output_text' => 'partial',
        ]);
        $events = (new RunReplayEventSynthesizer($run))->build();

        expect(end($events)['event'])->toBe('run.errored');
        expect(end($events)['payload']['message'])->toBe('Vendor rate-limited');
    });

    it('handles an empty token_log (just start + completed)', function () {
        $run = denseCompleteRun([]);
        $events = (new RunReplayEventSynthesizer($run))->build();

        expect($events)->toHaveCount(2);
        expect($events[0]['event'])->toBe('run.started');
        expect($events[1]['event'])->toBe('run.completed');
    });

    it('handles a null token_log (defensive against legacy rows)', function () {
        $run = Run::factory()->create([
            'status' => RunStatus::Complete,
            'parameters' => [
                'model_snapshot' => ['architecture_type' => 'dense', 'layers' => 12],
            ],
            'token_log' => null,
        ]);
        $events = (new RunReplayEventSynthesizer($run))->build();

        expect($events)->toHaveCount(2);
        expect($events[0]['event'])->toBe('run.started');
        expect($events[1]['event'])->toBe('run.completed');
    });

    it('preserves logprobs from token_log into token.received payloads', function () {
        $log = [[
            'token' => 'Hello',
            'index' => 0,
            't_ms' => 100,
            'logprobs' => [
                ['token' => 'Hello', 'logprob' => -0.1],
                ['token' => 'Hi', 'logprob' => -2.3],
            ],
        ]];
        $run = denseCompleteRun($log);
        $events = (new RunReplayEventSynthesizer($run))->build();

        $token = array_values(array_filter(
            $events,
            fn ($e) => $e['event'] === 'token.received',
        ))[0];
        expect($token['payload']['logprobs'])->toHaveCount(2);
        expect($token['payload']['logprobs'][0]['token'])->toBe('Hello');
    });
});
