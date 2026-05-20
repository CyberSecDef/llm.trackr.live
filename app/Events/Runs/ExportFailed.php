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
 * Broadcast when an `ExportRunGif` job throws — M10 chunk 5.
 *
 * Lets the frontend chooser surface a "Render failed" toast
 * without polling. Message is operator-readable; we don't expose
 * stack traces to the browser.
 *
 * Companion to `ExportCompleted`. Same channel + broadcast-name
 * convention: `export.failed` on `private-runs.{id}`.
 */
class ExportFailed implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly Run $run,
        public readonly string $message,
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
            'message' => $this->message,
        ];
    }

    public function broadcastAs(): string
    {
        return 'export.failed';
    }
}
