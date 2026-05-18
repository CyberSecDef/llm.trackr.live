<?php

namespace App\Services\Llm\Exceptions;

/**
 * Vendor returned HTTP 429. Distinct from our own per-user rate limit
 * (which is enforced upstream of the vendor client and never reaches
 * the vendor at all).
 */
class VendorRateLimitedException extends LlmClientException
{
    public function __construct(
        string $message,
        public readonly ?int $retryAfterSeconds = null,
    ) {
        parent::__construct($message);
    }
}
