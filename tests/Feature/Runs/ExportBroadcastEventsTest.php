<?php

use App\Events\Runs\ExportCompleted;
use App\Events\Runs\ExportFailed;
use App\Models\Run;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

describe('ExportCompleted', function () {
    it('broadcasts on the private-runs.{id} channel', function () {
        $run = Run::factory()->create();
        $event = new ExportCompleted(
            run: $run,
            gifUrl: '/runs/1/exports/gif',
            mp4Url: '/runs/1/exports/mp4',
            framesCount: 90,
            durationMs: 3_000,
        );

        $channels = $event->broadcastOn();
        expect($channels)->toHaveCount(1);
        expect($channels[0])->toBeInstanceOf(PrivateChannel::class);
        expect($channels[0]->name)->toBe("private-runs.{$run->id}");
    });

    it('broadcasts as `export.completed`', function () {
        $event = new ExportCompleted(
            Run::factory()->create(),
            '/g',
            '/m',
            10,
            500,
        );
        expect($event->broadcastAs())->toBe('export.completed');
    });

    it('payload includes run_id, gif_url, mp4_url, frames_count, duration_ms, fallback_engaged', function () {
        $run = Run::factory()->create();
        $event = new ExportCompleted(
            run: $run,
            gifUrl: "/runs/{$run->id}/exports/gif",
            mp4Url: "/runs/{$run->id}/exports/mp4",
            framesCount: 90,
            durationMs: 3_000,
            fallbackEngaged: true,
        );

        expect($event->broadcastWith())->toEqual([
            'run_id' => $run->id,
            'gif_url' => "/runs/{$run->id}/exports/gif",
            'mp4_url' => "/runs/{$run->id}/exports/mp4",
            'frames_count' => 90,
            'duration_ms' => 3_000,
            'fallback_engaged' => true,
        ]);
    });

    it('fallback_engaged defaults to false (chunk 6)', function () {
        $event = new ExportCompleted(
            Run::factory()->create(),
            '/g',
            '/m',
            10,
            500,
        );
        expect($event->broadcastWith()['fallback_engaged'])->toBeFalse();
    });
});

describe('ExportFailed', function () {
    it('broadcasts on the private-runs.{id} channel', function () {
        $run = Run::factory()->create();
        $event = new ExportFailed($run, 'ffmpeg not installed');

        $channels = $event->broadcastOn();
        expect($channels[0]->name)->toBe("private-runs.{$run->id}");
    });

    it('broadcasts as `export.failed`', function () {
        $event = new ExportFailed(Run::factory()->create(), 'oops');
        expect($event->broadcastAs())->toBe('export.failed');
    });

    it('payload includes run_id + message only (no stack trace)', function () {
        $run = Run::factory()->create();
        $event = new ExportFailed($run, 'Chromium binary not found');

        expect($event->broadcastWith())->toEqual([
            'run_id' => $run->id,
            'message' => 'Chromium binary not found',
        ]);
    });
});
