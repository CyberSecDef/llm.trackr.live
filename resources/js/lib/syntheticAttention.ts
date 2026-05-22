/*
 * syntheticAttention (M13 chunk 5) — deterministic Q/K/V projections,
 * multi-head attention matrices, and value-vector blending for
 * Scene 8 (multi-head self-attention, the centerpiece).
 *
 * Per the M13 architectural note: "Everything else is illustrative…
 * all rendered deterministically from `(run.id, model_metadata,
 * token_index, layer_index)` seeds." For chunk 5 we seed by
 * `(tokenIndex, headIndex, layerIndex=0)` only — `runId` plumbing
 * lands in chunk 10 alongside the WebSocket event wiring. The
 * matrix generator wraps the existing M8 `lib/attentionPattern`
 * (causal mask + distance-decay + xorshift noise) and varies the
 * seed per head so different heads produce visibly distinct
 * patterns.
 *
 * Three Q/K/V projections are synthesized by xorshift32-seeded
 * sign-flip patterns over the input embedding — Q/K/V remain in
 * the same [-1, 1] magnitude range as the input so they read as
 * "this is a projection of that strip", not "this is a different
 * vector entirely." Real transformer Q/K/V come from learned
 * linear projections `W_Q / W_K / W_V`; the sign-flip mask is a
 * compact pedagogical stand-in.
 */

import { generateAttentionPattern } from '@/lib/attentionPattern';

const Q_OFFSET = 0x11111111;
const K_OFFSET = 0x22222222;
const V_OFFSET = 0x33333333;

/** xorshift32 step. Mutates `state` and returns a float in [-1, 1]. */
function step(state: number): { value: number; next: number } {
    let s = state | 0;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return { value: (s | 0) / 2147483648, next: s };
}

/**
 * Apply a deterministic sign-flip mask to `embedding` seeded by
 * `(roleOffset, tokenIndex, headIndex)`. Output magnitudes equal
 * input magnitudes; output signs are a per-cell random flip.
 *
 * Returns a new array; does not mutate the input.
 */
function projectWithMask(
    embedding: readonly number[],
    roleOffset: number,
    tokenIndex: number,
    headIndex: number,
): number[] {
    let s = (roleOffset ^ (tokenIndex * 0x9e3779b9) ^ (headIndex * 0x85ebca6b)) | 0;
    if (s === 0) s = 1; // xorshift32 forbids zero state
    const out = new Array<number>(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
        const { value, next } = step(s);
        s = next;
        out[i] = value >= 0 ? embedding[i] : -embedding[i];
    }
    return out;
}

export interface QKVTriple {
    /** Query vector, shape == embedding. */
    q: readonly number[];
    /** Key vector, shape == embedding. */
    k: readonly number[];
    /** Value vector, shape == embedding. */
    v: readonly number[];
}

/**
 * Build Q/K/V triple for a single token. Deterministic per
 * `(tokenIndex, headIndex)`. The same token at the same head
 * always produces the same triple, so a scrubber can jump to
 * Scene 8 and see identical Q/K/V to the original playback.
 *
 * `headIndex` defaults to 0 (the "representative head" rendered
 * in Scene 8a + 8c). The multi-head reveal in 8b varies head
 * index through `generateMultiHeadMatrices()`.
 */
export function splitQKV(
    embedding: readonly number[],
    tokenIndex: number,
    headIndex = 0,
): QKVTriple {
    return {
        q: projectWithMask(embedding, Q_OFFSET, tokenIndex, headIndex),
        k: projectWithMask(embedding, K_OFFSET, tokenIndex, headIndex),
        v: projectWithMask(embedding, V_OFFSET, tokenIndex, headIndex),
    };
}

/**
 * Per-head N×N attention matrix array. Each head's matrix is
 * causal-masked + distance-decay + row-normalized via
 * `generateAttentionPattern`. Head index is folded into the
 * `layerIndex` seed so distinct heads render as visibly different
 * patterns.
 *
 * Defaults: `totalLayers = 32` matches typical mid-sized models
 * (Llama-7B, GPT-3.5); `numHeads` defaults to 6 which is the
 * Scene 8b fan-out spec. Real `model.attention_heads` is communicated
 * via the matrix-stack caption, not by rendering all 32.
 */
export function generateMultiHeadMatrices(
    tokenCount: number,
    numHeads: number,
    layerIndex = 0,
    totalLayers = 32,
): number[][][] {
    if (tokenCount <= 0 || numHeads <= 0) return [];
    const heads: number[][][] = [];
    for (let h = 0; h < numHeads; h++) {
        // Fold head into the layer seed so each head looks distinct.
        // Bias by 7 so head 0 != "layer 0" exactly — keeps the
        // representative head visually consistent with the M8
        // tower view's layer-0 matrix while still differentiating
        // when multiple heads are visible side-by-side.
        const seedLayer = (layerIndex * 1000 + h * 7) % totalLayers;
        heads.push(generateAttentionPattern(tokenCount, seedLayer, totalLayers));
    }
    return heads;
}

/**
 * For each output position `i`, compute the weighted sum
 *   out[i] = Σ_j attentionMatrix[i][j] * values[j]
 * where `attentionMatrix[i]` is the post-softmax causal attention
 * row (cells j > i are zero). Returns one vector per query position
 * with the same dim as a `values[j]` row.
 *
 * Scene 8c renders this with per-position fade-in: V vectors pull
 * into each output position with opacity proportional to their
 * attention weight, then collapse into the output strip.
 */
export function blendValues(
    values: readonly (readonly number[])[],
    attentionMatrix: readonly (readonly number[])[],
): number[][] {
    if (values.length === 0 || attentionMatrix.length === 0) return [];
    const dim = values[0].length;
    const out: number[][] = [];
    for (let i = 0; i < attentionMatrix.length; i++) {
        const row = attentionMatrix[i];
        const accum = new Array<number>(dim).fill(0);
        for (let j = 0; j < row.length && j < values.length; j++) {
            const w = row[j];
            if (w === 0) continue;
            const vj = values[j];
            for (let d = 0; d < dim && d < vj.length; d++) {
                accum[d] += w * vj[d];
            }
        }
        out.push(accum);
    }
    return out;
}
