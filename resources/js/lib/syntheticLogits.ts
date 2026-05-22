/*
 * syntheticLogits (M13 chunk 8a) — deterministic helpers for
 * Scenes 14 / 15 / 16 (LM head projection, softmax, sampling).
 *
 * Real next-token logits aren't observable from the vendor API
 * stream (we get the chosen token + sometimes a few logprobs,
 * never the full 128k-cell row). So we synthesize a plausible
 * logits distribution from `(lastVector, vocabSize, seedKey)`:
 * mostly cool/low values with a handful of injected hot spikes
 * at deterministic positions.
 *
 * `synthesizeLogits()` returns the full `vocabSize`-length array
 * so downstream scenes (15, 16) can operate on the real
 * distribution. Scene 14 downsamples to a render-friendly
 * resolution (~1024 cells) for the long-strip heatmap.
 *
 * Chunk 8b extends this file with sampling helpers (softmax,
 * top-K, top-P, sample-by-mode). Chunk 8a only needs the
 * generator + top-K extraction.
 */

const HOT_SPIKE_COUNT = 8;
const COLD_AMPLITUDE = 0.15;
const HOT_AMPLITUDE = 4;

export interface LogitsResult {
    /** Full vocab-length logit array. Values are unbounded reals
     *  (pre-softmax). Most cells are in [-COLD, COLD]; spikes are
     *  in [SPIKE_MIN, HOT]. */
    values: readonly number[];
    /** Indices of the top-N highest logits, sorted descending. */
    topIndices: readonly number[];
}

/**
 * Build a synthetic logits row of length `vocabSize`, seeded by
 * `(seedKey, sumOfLastVector)`. Distribution: most cells small
 * Gaussian-ish noise; a small set of "hot spike" positions get
 * injected high values to simulate the natural sparsity of LLM
 * next-token predictions.
 *
 * The hot-spike positions are deterministic per seed so a replay
 * shows the same logits — the chosen token will land in the same
 * place every time. `topN` controls how many top indices to
 * return alongside the array.
 */
export function synthesizeLogits(
    lastVector: readonly number[],
    vocabSize: number,
    seedKey: number,
    topN = 12,
): LogitsResult {
    if (vocabSize <= 0) return { values: [], topIndices: [] };

    // Mix the last vector's signature into the seed so different
    // tokens land on different distributions even with the same
    // seedKey. Sum is a cheap, position-invariant fingerprint.
    const vecSig = lastVector.reduce((s, v) => s + v, 0);
    let s = (((seedKey | 0) * 0x9e3779b9) ^ Math.round(vecSig * 1000)) | 0;
    if (s === 0) s = 1;

    // Generate base cool-noise array.
    const values = new Array<number>(vocabSize);
    for (let i = 0; i < vocabSize; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        values[i] = (s / 2147483648) * COLD_AMPLITUDE;
    }

    // Inject hot spikes at deterministic positions. Spike heights
    // decay so #1 dominates, #2 second-highest, etc. — mimics the
    // natural shape of LLM logits where top-1 is usually clearly
    // ahead of top-2.
    const spikePositions: number[] = [];
    for (let i = 0; i < HOT_SPIKE_COUNT; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        const pos = Math.abs(s >>> 0) % vocabSize;
        spikePositions.push(pos);
        // Spike values decay from HOT_AMPLITUDE down to ~HOT/3.
        const decay = 1 - i / HOT_SPIKE_COUNT;
        values[pos] = HOT_AMPLITUDE * (0.33 + 0.67 * decay);
    }

    // Compute top-N indices for downstream consumers.
    const indexed = values.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => b.v - a.v);
    const topIndices = indexed.slice(0, topN).map((x) => x.i);

    return { values, topIndices };
}

/**
 * Downsample a long logits array to `targetLen` cells via
 * max-pooling (keeps spikes visible at coarse resolution). Used
 * by Scene 14's heatmap render — drawing 128,000 SVG rects is a
 * non-starter at 30 FPS.
 */
export function downsampleLogits(values: readonly number[], targetLen: number): number[] {
    if (values.length === 0 || targetLen <= 0) return [];
    if (values.length <= targetLen) return [...values];
    const out = new Array<number>(targetLen);
    const ratio = values.length / targetLen;
    for (let i = 0; i < targetLen; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(Math.floor((i + 1) * ratio), values.length);
        let m = values[start];
        for (let j = start + 1; j < end; j++) {
            if (values[j] > m) m = values[j];
        }
        out[i] = m;
    }
    return out;
}

/**
 * Extract the top-K logit values + their original vocab indices.
 * Returns sorted-descending by value. Used by Scene 15 to build
 * the horizontal bar chart.
 */
export function pickTopK(values: readonly number[], k: number): { value: number; index: number }[] {
    if (k <= 0 || values.length === 0) return [];
    const indexed = values.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => b.value - a.value);
    return indexed.slice(0, k);
}

/**
 * Apply softmax with optional temperature scaling. Numerically
 * stable via the standard max-subtraction trick. Temperature < 1
 * sharpens the distribution (top-1 dominates more); > 1 flattens.
 * Returns probabilities summing to 1.
 */
export function softmax(values: readonly number[], temperature = 1): number[] {
    if (values.length === 0) return [];
    const t = Math.max(1e-6, temperature);
    // Find max for stability before exponentiating.
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
        if (values[i] > max) max = values[i];
    }
    const exps = values.map((v) => Math.exp((v - max) / t));
    let sum = 0;
    for (const e of exps) sum += e;
    if (sum <= 0) return values.map(() => 1 / values.length);
    return exps.map((e) => e / sum);
}

/**
 * Given an already-sorted-descending probability array, find the
 * smallest index `i` such that probs[0] + … + probs[i] >= p.
 * Returns probs.length if the cumulative never reaches p (shouldn't
 * happen for a normalized distribution + p ∈ [0, 1]).
 *
 * Used by Scene 16's top-p sampling beat: "fill line sweeps from
 * left until cumulative probability reaches p."
 */
export function topPCutoffIndex(sortedProbs: readonly number[], p: number): number {
    if (sortedProbs.length === 0) return 0;
    const target = Math.max(0, Math.min(1, p));
    let cum = 0;
    for (let i = 0; i < sortedProbs.length; i++) {
        cum += sortedProbs[i];
        if (cum >= target) return i;
    }
    return sortedProbs.length - 1;
}

/**
 * Pick a single token index from a sorted-descending probability
 * distribution, given the sampling mode. Deterministic per
 * `(sampleSeed, mode, k, p)`.
 *
 * Greedy:  always returns index 0.
 * Top-K:   xorshift32-seeded pick from indices [0, k).
 * Top-P:   xorshift32-seeded pick from [0, topPCutoff].
 *
 * Returns the index into `sortedProbs`, not the original vocab
 * index — caller maps back via the indexed top-K list.
 */
export type SamplingMode = 'greedy' | 'top_k' | 'top_p';

export function sampleByMode(
    sortedProbs: readonly number[],
    mode: SamplingMode,
    k: number,
    p: number,
    sampleSeed: number,
): number {
    if (sortedProbs.length === 0) return 0;
    if (mode === 'greedy') return 0;

    let upperBound: number;
    if (mode === 'top_k') {
        upperBound = Math.max(1, Math.min(k, sortedProbs.length));
    } else {
        // top_p: cap at the cumulative-p cutoff
        upperBound = topPCutoffIndex(sortedProbs, p) + 1;
    }

    // Weighted xorshift32 draw within [0, upperBound). Re-normalize
    // the truncated probs so the weights still sum to ~1.
    let s = (sampleSeed | 0) ^ 0xabad1dea;
    if (s === 0) s = 1;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const r01 = (s >>> 0) / 0xffffffff;

    const truncated = sortedProbs.slice(0, upperBound);
    let truncSum = 0;
    for (const v of truncated) truncSum += v;
    if (truncSum <= 0) return 0;
    const target = r01 * truncSum;
    let cum = 0;
    for (let i = 0; i < truncated.length; i++) {
        cum += truncated[i];
        if (cum >= target) return i;
    }
    return truncated.length - 1;
}

/**
 * Synthetic token-string bank. Real tokenizer-grounded strings
 * come in chunk 10 when the WebSocket-streamed winner overrides
 * the synthetic pick. For chunk 8b we pick from this table keyed
 * by the chosen top-K rank so each spike consistently maps to a
 * plausible-looking string.
 *
 * Strings include a leading space when it's natural (mid-sentence
 * tokens) so the chat-bubble accumulator looks like real
 * generation. Deliberately bland English so it reads as
 * "illustrative continuation" rather than a fabricated quote.
 */
const SYNTHETIC_TOKEN_BANK: readonly string[] = [
    ' the',
    ' a',
    ' is',
    ' that',
    ' and',
    ' it',
    ' was',
    ' I',
    ' to',
    ' in',
    ' of',
    ' for',
    ' on',
    ' with',
    ' as',
    ' by',
];

export function syntheticTokenString(topKRank: number): string {
    if (SYNTHETIC_TOKEN_BANK.length === 0) return ' ?';
    const i =
        (((topKRank | 0) % SYNTHETIC_TOKEN_BANK.length) + SYNTHETIC_TOKEN_BANK.length) %
        SYNTHETIC_TOKEN_BANK.length;
    return SYNTHETIC_TOKEN_BANK[i];
}
