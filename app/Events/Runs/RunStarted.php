<?php

namespace App\Events\Runs;

use App\Models\Run;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Broadcast at the moment StreamRunJob (M6 chunk 3) picks up a Run
 * and starts streaming. The frontend's useRunStream hook (chunk 4)
 * listens for this to flip the viz from "submitted, waiting" to
 * "streaming, layer 0".
 *
 * Channel: private-runs.{run_id}. Only the run's owner gets the
 * authorize() pass in routes/channels.php (also chunk 4).
 *
 * The remaining run events — TokenReceived, LayerAdvanced,
 * MoeRouted, RunCompleted, RunErrored — land in chunk 2 as siblings
 * to this class. This one exists in chunk 1 just to verify the
 * Reverb wiring is functional end-to-end before we build out the
 * rest of the event surface.
 */
class RunStarted implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(public readonly Run $run) {}

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
            'thread_id' => $this->run->thread_id,
            'model_id' => $this->run->model_id,
            'started_at' => now()->toIso8601String(),
        ];
    }
}
