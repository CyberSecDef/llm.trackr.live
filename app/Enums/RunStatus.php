<?php

namespace App\Enums;

/**
 * Lifecycle status for a single inference run.
 *
 *   Pending   – row inserted, vendor call not yet started
 *   Streaming – vendor stream open, chunks being recorded
 *   Complete  – stream finished cleanly, token_log + output_text final
 *   Error     – stream failed mid-flight, error_message populated
 */
enum RunStatus: string
{
    case Pending = 'pending';
    case Streaming = 'streaming';
    case Complete = 'complete';
    case Error = 'error';

    public function isTerminal(): bool
    {
        return $this === self::Complete || $this === self::Error;
    }
}
