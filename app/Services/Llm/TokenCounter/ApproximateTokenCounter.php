<?php

namespace App\Services\Llm\TokenCounter;

use App\Services\Llm\Contracts\TokenCounterInterface;

/**
 * Vendor-agnostic token-count approximation.
 *
 * Used for every vendor except OpenAI (where OpenAiTokenCounter has
 * exact BPE tables). The estimate is the standard "1 token ≈ 4 chars"
 * heuristic, with a small adjustment for whitespace-heavy text.
 *
 * Expected accuracy: ±20% in typical English prose; less reliable on
 * code, non-Latin scripts, or very short inputs. The UI surfaces this
 * by prefixing approximate counts with `~`.
 *
 * For better-than-approximate counts per vendor in the future:
 *   - Anthropic publishes /v1/messages/count_tokens — chunk 4 could
 *     wire that in for an exact count.
 *   - Google's tokenizer is proprietary; no in-process option exists.
 *   - Mistral/Llama use SentencePiece — could ship a PHP port if
 *     accuracy matters more than bundle size.
 */
class ApproximateTokenCounter implements TokenCounterInterface
{
    public function count(string $text): int
    {
        if ($text === '') {
            return 0;
        }

        // Whitespace-heavy text needs a slight upward correction since
        // BPE tokenizers typically split on spaces.
        $chars = mb_strlen($text);
        $whitespace = preg_match_all('/\s+/', $text);

        // 4 chars per token, plus 1 token per N whitespace runs above
        // the baseline (≈ 1 word per 4 chars).
        return (int) ceil($chars / 4) + (int) floor($whitespace / 4);
    }

    public function isExact(): bool
    {
        return false;
    }
}
