<?php

namespace App\Services\Threads\Exceptions;

/**
 * Caller submitted an empty / whitespace-only prompt. Maps to HTTP 422.
 */
class EmptyPromptException extends RunSubmissionException
{
    public function __construct()
    {
        parent::__construct('Prompt cannot be empty.');
    }
}
