<?php

namespace App\Services\Threads\Exceptions;

/**
 * One or more inference parameters are outside the SPEC §3.1.4
 * bounds. Maps to HTTP 422 with the offending field name.
 */
class InvalidParamsException extends RunSubmissionException
{
    public function __construct(public readonly string $field, string $reason)
    {
        parent::__construct("Invalid parameter '{$field}': {$reason}");
    }
}
