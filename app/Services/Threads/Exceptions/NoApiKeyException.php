<?php

namespace App\Services\Threads\Exceptions;

/**
 * User has no API key configured for the selected model's vendor.
 * Maps to HTTP 422 with a "go add a key" hint in the UI.
 */
class NoApiKeyException extends RunSubmissionException
{
    public function __construct(public readonly string $vendor)
    {
        parent::__construct("No API key on file for vendor '{$vendor}'. Add one on the API Keys page.");
    }
}
