<?php

namespace App\Services\Llm;

use App\Services\Llm\Contracts\LlmClientInterface;
use App\Services\Llm\Exceptions\UnsupportedVendorException;

/**
 * Resolves a vendor name (matching `models.vendor`) to a concrete
 * LlmClientInterface implementation.
 *
 * Registration-based so tests can swap a fake client for any vendor
 * via `app(LlmClientFactory::class)->register('openai', new FakeClient)`.
 * The default set is populated in AppServiceProvider once chunks 3–5
 * land each concrete vendor client.
 */
class LlmClientFactory
{
    /** @var array<string, LlmClientInterface> */
    private array $clients = [];

    public function register(LlmClientInterface $client): void
    {
        $this->clients[$client->vendor()] = $client;
    }

    public function clientFor(string $vendor): LlmClientInterface
    {
        if (! isset($this->clients[$vendor])) {
            throw UnsupportedVendorException::forVendor($vendor);
        }

        return $this->clients[$vendor];
    }

    public function supports(string $vendor): bool
    {
        return isset($this->clients[$vendor]);
    }

    /** @return list<string> */
    public function supportedVendors(): array
    {
        return array_keys($this->clients);
    }
}
