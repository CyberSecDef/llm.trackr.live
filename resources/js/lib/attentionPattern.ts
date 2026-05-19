/*
 * attentionPattern (M8 chunk 5a) — synthetic per-layer attention.
 *
 * Real transformer attention weights aren't exposed by vendor APIs
 * (OpenAI / Anthropic / Together / etc. ship logprobs but not the
 * internal attention tensor). So the heatmap is illustrative — it
 * shows what *kind* of pattern a causal self-attention layer would
 * produce, calibrated by layer depth:
 *
 *   - Early layers attend locally (small effective receptive field).
 *   - Late layers attend more broadly (larger decay constant).
 *
 * Properties:
 *   - Causal: upper triangle is zero (a query at position i sees
 *     only positions 0..i).
 *   - Distance-decay: weight falls off exponentially with |i - j|.
 *   - Per-row normalized so each query's weights sum to 1.
 *   - Deterministic per (layerIndex, tokenCount) — the same focused
 *     view renders the same matrix on every render.
 *
 * The noise term is small and seeded so the pattern reads as
 * "attention-y" rather than visibly smooth.
 */

export interface AttentionPatternOptions {
    /** Min decay constant in tokens — sets how local the earliest layer is. */
    minDecay?: number;
    /** Noise amplitude in [0, 1]. 0 = deterministic exp decay only. */
    noise?: number;
}

/**
 * Build an N×N attention matrix where N = tokenCount. Each row sums
 * to 1 (over its causal prefix). Upper triangle is zero.
 */
export function generateAttentionPattern(
    tokenCount: number,
    layerIndex: number,
    totalLayers: number,
    options: AttentionPatternOptions = {},
): number[][] {
    const n = Math.max(0, Math.floor(tokenCount));
    if (n === 0) return [];

    const minDecay = options.minDecay ?? 2;
    const noiseAmp = options.noise ?? 0.3;

    // Depth fraction in [0, 1]. Layer 0 → 0 (most local), last layer → 1.
    const depthFrac =
        totalLayers > 1 ? Math.max(0, Math.min(1, layerIndex / (totalLayers - 1))) : 0;
    // Decay constant grows with depth so late layers' attention falls
    // off more slowly (broader receptive field).
    const decay = minDecay + depthFrac * Math.max(1, n / 2);

    // xorshift32 seeded by (layerIndex, n) — deterministic per matrix.
    let rngState = layerIndex * 0x9e3779b9 + n * 0x85ebca6b + 1;
    const rng = (): number => {
        rngState ^= rngState << 13;
        rngState ^= rngState >>> 17;
        rngState ^= rngState << 5;
        return ((rngState >>> 0) % 1_000_000) / 1_000_000;
    };

    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
        const row = new Array<number>(n);
        let rowSum = 0;
        for (let j = 0; j < n; j++) {
            if (j > i) {
                row[j] = 0; // causal mask
                continue;
            }
            const d = i - j;
            const base = Math.exp(-d / decay);
            const jitter = 1 + (rng() - 0.5) * 2 * noiseAmp;
            const w = Math.max(0, base * jitter);
            row[j] = w;
            rowSum += w;
        }
        if (rowSum > 0) {
            for (let j = 0; j <= i; j++) {
                row[j] = row[j] / rowSum;
            }
        }
        matrix.push(row);
    }
    return matrix;
}
