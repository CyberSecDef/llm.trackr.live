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
 * Terminal event when a run finishes cleanly. Dispatched by
 * StreamRunJob (M6 chunk 3) after the vendor stream closes and the
 * Run row's token_log + output_text + status are persisted.
 *
 * Carries final usage stats so the frontend can update the run-level
 * cost / token-count readouts without an extra HTTP round trip.
 */
class RunCompleted implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly Run $run,
        public readonly int $inputTokens,
        public readonly int $outputTokens,
        public readonly int $durationMs,
        public readonly float $tokensPerSecond,
        public readonly ?float $estimatedCost,
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
            'input_tokens' => $this->inputTokens,
            'output_tokens' => $this->outputTokens,
            'duration_ms' => $this->durationMs,
            'tokens_per_second' => $this->tokensPerSecond,
            'estimated_cost' => $this->estimatedCost,
        ];
    }
}
