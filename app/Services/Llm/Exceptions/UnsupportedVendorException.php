<?php

namespace App\Services\Llm\Exceptions;

class UnsupportedVendorException extends LlmClientException
{
    public static function forVendor(string $vendor): self
    {
        return new self("No LLM client registered for vendor '{$vendor}'.");
    }
}
