<?php

namespace App\Services\Llm\Exceptions;

/**
 * Vendor returned an authentication error (typically HTTP 401/403).
 * Surfaces to the user as "Invalid API key for {vendor}" with a link
 * to the API Keys page.
 */
class InvalidApiKeyException extends LlmClientException
{
    public static function forVendor(string $vendor): self
    {
        return new self("Vendor '{$vendor}' rejected the supplied API key.");
    }
}
