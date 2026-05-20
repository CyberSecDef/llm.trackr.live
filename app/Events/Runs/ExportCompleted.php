<?php

namespace App\Events\Runs;

use App\Models\Run;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Broadcast when an `ExportRunGif` job finishes a render
 * successfully (or short-circuits on a cache hit) — M10 chunk 5.
 *
 * Wire shape mirrors the M6 run events: `broadcastAs` is short
 * kebab-case (`export.completed`), `broadcastOn` is the same
 * `private-runs.{id}` channel the per-token stream uses. Means
 * the frontend can subscribe once for both run + export events.
 *
 * Frontend consumer: `useExportTrigger` (chunk 5b) flips its
 * state from "rendering" to "ready" with these URLs.
 */
class ExportCompleted implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly Run $run,
        public readonly string $gifUrl,
        public readonly string $mp4Url,
        public readonly int $framesCount,
        public readonly int $durationMs,
    ) {}

    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel("runs.{$this->run->id}")];
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'run_id' => $this->run->id,
            'gif_url' => $this->gifUrl,
            'mp4_url' => $this->mp4Url,
            'frames_count' => $this->framesCount,
            'duration_ms' => $this->durationMs,
        ];
    }

    public function broadcastAs(): string
    {
        return 'export.completed';
    }
}
