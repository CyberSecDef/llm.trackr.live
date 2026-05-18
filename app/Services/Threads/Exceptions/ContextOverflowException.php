<?php

namespace App\Services\Threads\Exceptions;

use App\Services\Threads\ContextBudgetResult;

/**
 * Conversation + new prompt + reserved response tokens would exceed
 * the model's context window. Maps to HTTP 422. Carries the budget
 * result so the UI can show "you're N tokens over a Y-token window".
 */
class ContextOverflowException extends RunSubmissionException
{
    public function __construct(public readonly ContextBudgetResult $result)
    {
        parent::__construct(sprintf(
            'Conversation is %d tokens over the model\'s %d-token context window. Trim history or start a new thread.',
            $result->overBy,
            $result->budget,
        ));
    }
}
