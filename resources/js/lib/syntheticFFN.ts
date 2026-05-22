/*
 * syntheticFFN (M13 chunk 6) — deterministic helpers for the
 * residual + FFN scenes (9, 10, 11).
 *
 * The pedagogical beats:
 *   - Scene 9 / 11: residual = a + b, element-wise. Vector identity
 *     of the transformer's most important plumbing primitive.
 *   - Scene 10: FFN as expand → non-linearity → contract. The
 *     expansion is rendered as a 4× cell count so a viewer literally
 *     sees the "this is where most of the parameters live" beat.
 *
 * `applyFFN()` returns a vector the same length as its input;
 * `expandToFFNDim()` and `contractFromFFNDim()` are the visual
 * adapters that let the scene render the wider middle stage
 * without changing the PipelineState shape.
 *
 * All randomness is xorshift32-seeded (`tokenIndex`) so a replay
 * shows the same sparkles in the same positions as the original
 * playback.
 */

/** GELU activation, exact-form approximation (Hendrycks & Gimpel 2016
 *  tanh approximation). 0.5·x·(1 + tanh(√(2/π)·(x + 0.044715·x³))). */
export function gelu(x: number): number {
    const c = Math.sqrt(2 / Math.PI);
    return 0.5 * x * (1 + Math.tanh(c * (x + 0.044715 * x * x * x)));
}

/** Swish / SiLU activation (the SwiGLU variant's gating function):
 *  x · sigmoid(x). Used for Llama / Mistral / Qwen architectures. */
export function swish(x: number): number {
    return x / (1 + Math.exp(-x));
}

/** Element-wise sum (the residual connection). Clamps to the shorter
 *  of the two inputs to avoid NaN/undefined for mismatched dims. */
export function applyResidual(a: readonly number[], b: readonly number[]): number[] {
    const n = Math.min(a.length, b.length);
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = a[i] + b[i];
    return out;
}

/**
 * Expand a vector to `factor`× its length by deterministic linear
 * interpolation of adjacent cells plus xorshift32-seeded jitter
 * (`tokenIndex` keys the jitter). Used by Scene 10 to render the
 * 4× expanded middle stage; the contract step squeezes back.
 *
 * Jitter is ±5% so the expanded strip *looks* like a richer version
 * of the input rather than just a 4-pixel duplicate.
 */
export function expandToFFNDim(v: readonly number[], factor: number, tokenIndex: number): number[] {
    if (v.length === 0 || factor <= 0) return [];
    const outLen = Math.max(1, Math.floor(v.length * factor));
    const out: number[] = new Array(outLen);
    let s = ((tokenIndex | 0) * 0x9e3779b9) ^ 0xdeadbeef;
    if (s === 0) s = 1;
    for (let i = 0; i < outLen; i++) {
        const srcF = (i / outLen) * (v.length - 1);
        const srcIdx = Math.floor(srcF);
        const frac = srcF - srcIdx;
        const a = v[srcIdx] ?? 0;
        const b = v[Math.min(srcIdx + 1, v.length - 1)] ?? 0;
        const interp = a * (1 - frac) + b * frac;
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        const jitter = (s / 2147483648) * 0.05;
        out[i] = interp + jitter;
    }
    return out;
}

/**
 * Average groups of cells from an expanded vector back down to
 * `targetLen`. Inverse of `expandToFFNDim` (averaging cancels the
 * linear interpolation; the small jitter is averaged out too).
 */
export function contractFromFFNDim(expanded: readonly number[], targetLen: number): number[] {
    if (targetLen <= 0 || expanded.length === 0) return [];
    const out: number[] = new Array(targetLen);
    const ratio = expanded.length / targetLen;
    for (let i = 0; i < targetLen; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(Math.floor((i + 1) * ratio), expanded.length);
        let sum = 0;
        let count = 0;
        for (let j = start; j < end; j++) {
            sum += expanded[j];
            count++;
        }
        out[i] = count > 0 ? sum / count : 0;
    }
    return out;
}

/**
 * Apply a synthetic FFN: expand → non-linearity → contract. Returns
 * a vector the same length as the input. The non-linearity is
 * chosen via `pickNonlinearity(archType)`.
 */
export function applyFFN(
    v: readonly number[],
    tokenIndex: number,
    archType: string | null,
): number[] {
    if (v.length === 0) return [];
    const expanded = expandToFFNDim(v, 4, tokenIndex);
    const activation = pickNonlinearity(archType);
    const activated = expanded.map(activation === 'SwiGLU' ? swish : gelu);
    return contractFromFFNDim(activated, v.length);
}

/**
 * Pick the non-linearity label/function family from a model's
 * architecture string. SwiGLU is the modern default for Llama-style
 * stacks (Llama 2/3, Mistral, Qwen 2, Gemma); GELU is the older
 * Transformer / GPT-2 / BERT default.
 *
 * Returns the printable label; the calling site picks the actual
 * function (`gelu` or `swish`) by string-comparing.
 */
export function pickNonlinearity(archType: string | null): 'GELU' | 'SwiGLU' {
    if (!archType) return 'GELU';
    const lc = archType.toLowerCase();
    // MoE stacks (Mixtral, DeepSeek-MoE, Qwen-MoE) are SwiGLU.
    if (lc.includes('moe')) return 'SwiGLU';
    // Modern Llama-family + descendants.
    if (
        lc.includes('llama') ||
        lc.includes('mistral') ||
        lc.includes('qwen') ||
        lc.includes('gemma') ||
        lc.includes('phi')
    ) {
        return 'SwiGLU';
    }
    return 'GELU';
}

/**
 * Sparkle positions for Scene 10's "neuron firing" flourish.
 * Returns `count` (x, y) pairs in `[0, 1]²`, deterministic per
 * `(tokenIndex)`. The scene maps the unit square onto the rendered
 * expansion region.
 */
export function sparklePositions(tokenIndex: number, count: number): { x: number; y: number }[] {
    if (count <= 0) return [];
    let s = ((tokenIndex | 0) * 0x9e3779b9) ^ 0xfeedface;
    if (s === 0) s = 1;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        const x = ((s >>> 0) % 10000) / 10000;
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        const y = ((s >>> 0) % 10000) / 10000;
        out.push({ x, y });
    }
    return out;
}
