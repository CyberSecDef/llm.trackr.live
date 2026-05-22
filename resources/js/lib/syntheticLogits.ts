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
