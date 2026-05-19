import type { RunEvent, TokenLogprob } from '@/types/runs';

/*
 * logitsExtract (M8 chunk 5b) — turn the raw event stream into a
 * snapshot of "what the model considered for the most recent token."
 *
 * Walks the event array backwards, finds the latest `token.received`
 * carrying a non-null `logprobs` array, converts log-probabilities
 * to probabilities (`exp(logprob)`), normalizes (top-K rarely sums
 * to exactly 1 because the rest of the vocabulary tail is dropped
 * server-side), and returns the result sorted descending.
 *
 * Returns `null` when:
 *   - the event array is empty
 *   - no `token.received` event has logprobs (the vendor doesn't
 *     return them for this run)
 *
 * The component treats `null` as "hide the chart" — per chunk-5
 * decision, we don't fabricate or placeholder.
 */

export interface LogitsAlternative {
    token: string;
    /** Normalized probability across the returned top-K (sums to 1). */
    probability: number;
}

export interface LogitsSnapshot {
    /** The token the model actually emitted at this step. */
    chosenToken: string;
    /** Top-K alternatives (including chosenToken), sorted descending. */
    alternatives: LogitsAlternative[];
}

export function extractLatestLogprobs(events: RunEvent[], topK = 10): LogitsSnapshot | null {
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.event !== 'token.received') continue;
        const logprobs = e.payload.logprobs;
        if (!logprobs || logprobs.length === 0) continue;

        return buildSnapshot(e.payload.token, logprobs, topK);
    }
    return null;
}

function buildSnapshot(
    chosenToken: string,
    logprobs: TokenLogprob[],
    topK: number,
): LogitsSnapshot {
    // exp() each, then normalize so the top-K sums to 1. This is the
    // honest read — "given the alternatives the vendor reported,
    // how much weight did each carry?" rather than pretending we
    // know the full vocab tail.
    const probs = logprobs.map((lp) => Math.exp(lp.logprob));
    const sum = probs.reduce((acc, p) => acc + p, 0);
    const normalized = sum > 0 ? probs.map((p) => p / sum) : probs;

    // Pair, sort descending, trim to top-K.
    const paired = logprobs.map((lp, idx) => ({
        token: lp.token,
        probability: normalized[idx],
    }));
    paired.sort((a, b) => b.probability - a.probability);
    const top = paired.slice(0, topK);

    return { chosenToken, alternatives: top };
}
