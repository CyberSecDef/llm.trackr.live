<?php

namespace App\Services\Llm\TokenCounter;

use App\Services\Llm\Contracts\TokenCounterInterface;
use Yethee\Tiktoken\EncoderProvider;

/**
 * Exact token count for OpenAI models via the upstream BPE tables.
 *
 * Uses `yethee/tiktoken` (a PHP port of OpenAI's tiktoken library).
 * The provider caches encoders so repeated calls don't re-load the
 * BPE merge table from disk.
 *
 * Model → encoding mapping mirrors OpenAI's tiktoken docs. Unknown
 * model names fall back to o200k_base (current GPT-4o family).
 */
class OpenAiTokenCounter implements TokenCounterInterface
{
    private const MODEL_ENCODINGS = [
        // GPT-4o family
        'gpt-4o' => 'o200k_base',
        'gpt-4o-mini' => 'o200k_base',
        // GPT-4 / GPT-3.5
        'gpt-4' => 'cl100k_base',
        'gpt-4-turbo' => 'cl100k_base',
        'gpt-3.5-turbo' => 'cl100k_base',
    ];

    public function __construct(
        private readonly EncoderProvider $provider,
        private readonly string $model = 'gpt-4o',
    ) {}

    public function count(string $text): int
    {
        $encoding = self::MODEL_ENCODINGS[$this->model] ?? 'o200k_base';
        $encoder = $this->provider->get($encoding);

        return count($encoder->encode($text));
    }

    public function isExact(): bool
    {
        return true;
    }
}
