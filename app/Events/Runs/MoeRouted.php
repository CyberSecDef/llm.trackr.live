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
 * MoE router selection for one token. Only emitted when the model's
 * architecture_type = 'moe'. Drives the MoE Routing Graph viz panel
 * (SPEC §3.1.5).
 *
 * `experts` is the list of top-k expert IDs selected for this token.
 * `scores` is the corresponding probability for each (uniform if we
 * don't have real router data, which is true for every proprietary
 * MoE model since they don't expose router logits).
 *
 * Values are deterministic given (run.id, token_index) — RunEventEmitter
 * uses a hash-based PRNG so replays produce identical routing animations.
 */
class MoeRouted implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * @param  list<int>  $experts
     * @param  list<float>  $scores
     */
    public function __construct(
        public readonly Run $run,
        public readonly int $tokenIndex,
        public readonly array $experts,
        public readonly array $scores,
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
            'experts' => $this->experts,
            'scores' => $this->scores,
        ];
    }
}
