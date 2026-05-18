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
 * Per-token event during a streaming run. Drives the live-text panel
 * and (combined with LayerAdvanced) the layer-cascade animation.
 *
 * `index` is 0-based within the run. `t_ms` is monotonic milliseconds
 * since RunStarted — used by the viz to pace the animation correctly
 * during replay (the wall-clock from the original run is preserved).
 *
 * `logprobs` is null for vendors that don't expose them. When present,
 * the shape mirrors OpenAI's: a list of `{token, logprob, top_logprobs}`
 * entries that the logits panel (SPEC §3.1.5) renders directly.
 */
class TokenReceived implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * @param  list<array<string, mixed>>|null  $logprobs
     */
    public function __construct(
        public readonly Run $run,
        public readonly string $token,
        public readonly int $index,
        public readonly int $tMs,
        public readonly ?array $logprobs = null,
        public readonly bool $isFinal = false,
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
            'token' => $this->token,
            'index' => $this->index,
            't_ms' => $this->tMs,
            'logprobs' => $this->logprobs,
            'is_final' => $this->isFinal,
        ];
    }
}
