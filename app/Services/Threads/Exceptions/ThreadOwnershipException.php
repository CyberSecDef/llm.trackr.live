<?php

namespace App\Services\Threads\Exceptions;

/**
 * The acting user does not own the target thread. Maps to HTTP 403.
 */
class ThreadOwnershipException extends RunSubmissionException
{
    public static function userNotOwner(): self
    {
        return new self('You do not have access to this thread.');
    }
}
