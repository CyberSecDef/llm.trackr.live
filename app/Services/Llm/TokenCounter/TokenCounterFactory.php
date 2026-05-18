<?php

namespace App\Services\Llm\TokenCounter;

use App\Services\Llm\Contracts\TokenCounterInterface;
use Yethee\Tiktoken\EncoderProvider;

/**
 * Resolves the right token counter for a (vendor, model) pair.
 *
 * Only OpenAI gets the exact tiktoken-based counter; every other
 * vendor falls back to ApproximateTokenCounter. M4 chunk 4 can add
 * exact counters for individual vendors as the libraries mature
 * (Anthropic's count_tokens endpoint, sentencepiece for Llama, etc.)
 * — see ApproximateTokenCounter docblock.
 */
class TokenCounterFactory
{
    public function __construct(
        private readonly EncoderProvider $tiktokenProvider,
    ) {}

    public function counterFor(string $vendor, string $model = ''): TokenCounterInterface
    {
        return match ($vendor) {
            'openai' => new OpenAiTokenCounter($this->tiktokenProvider, $model ?: 'gpt-4o'),
            default => new ApproximateTokenCounter,
        };
    }
}
