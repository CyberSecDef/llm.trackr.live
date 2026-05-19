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
 * Terminal event when a run fails. Dispatched by StreamRunJob
 * (M6 chunk 3) after the Run row's status is flipped to Error and
 * the error_message + any partial token_log are persisted.
 *
 * `message` is user-facing — the HTTP/streaming-layer error class
 * names (`InvalidApiKeyException`, etc.) get mapped to friendly
 * copy before this fires.
 *
 * `partial_output` carries whatever text the stream produced before
 * it died — the viz can keep showing it as "partial result" rather
 * than wiping the panel.
 */
class RunErrored implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly Run $run,
        public readonly string $message,
        public readonly ?string $partialOutput = null,
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
            'partial_output' => $this->partialOutput,
        ];
    }

    public function broadcastAs(): string
    {
        return 'run.errored';
    }
}
