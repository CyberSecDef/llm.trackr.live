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
 * Derived event emitted per token to advance the 3D transformer-stack
 * animation. Fires alongside TokenReceived from RunEventEmitter.
 *
 * Carries the model's total layer count (snapshotted at run time) so
 * the frontend can render the cascade animation without re-querying
 * the model registry. `token_index` lets the viz state machine drop
 * stale events if the user scrubbed to a different point in playback.
 *
 * The actual per-layer activation animation is the frontend's job —
 * the SPEC calls for layers lighting up sequentially as token
 * generation proceeds. This event is the trigger; the cascade timing
 * is animated client-side.
 */
class LayerAdvanced implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly Run $run,
        public readonly int $tokenIndex,
        public readonly ?int $totalLayers,
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
            'token_index' => $this->tokenIndex,
            'total_layers' => $this->totalLayers,
        ];
    }
}
