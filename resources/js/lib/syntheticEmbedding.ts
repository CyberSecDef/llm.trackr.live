/*
 * syntheticEmbedding (M13 chunk 4a) — deterministic per-token
 * vector generator. We can't observe the real embedding table
 * through the vendor API, but we can synthesize a plausible one
 * for the cinematic visualization.
 *
 * Per the M13 architectural note: "Everything else is illustrative…
 * all rendered deterministically from `(run.id, model_metadata,
 * token_index, layer_index)` seeds." This helper supplies the
 * seeded RNG for Scenes 5 (embedding lookup), 6 (positional
 * encoding), and 7 (layer norm).
 *
 * Algorithm: xorshift32 seeded by the token ID. Same family the
 * TokenPill chunk-2 hue derivation uses, scaled to produce a
 * sequence of floats in [-1, 1]. Reseeding by token ID gives the
 * "same token → same embedding row" invariant, so replays are
 * frame-identical and a viewer can recognize a recurring word
 * by its color signature in the heatmap strip.
 */

/** Build a synthetic embedding vector of `dim` floats in [-1, 1]
 *  seeded by `tokenId`. Deterministic across runs + browsers. */
export function syntheticEmbedding(tokenId: number, dim: number): number[] {
    let s = (tokenId | 0) ^ 0x9e3779b9;
    if (s === 0) s = 1; // xorshift32 doesn't permit zero state
    const out: number[] = new Array(dim);
    for (let i = 0; i < dim; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        // Convert to [-1, 1] via /2^31 - 1 → near-uniform
        out[i] = (s | 0) / 2147483648;
    }
    return out;
}

/**
 * Apply a simplified positional rotation to an embedding vector
 * (M13 chunk 4 Scene 6 / RoPE visualization). The real RoPE
 * splits the dim into pairs and rotates each pair by a position-
 * dependent angle; for the animation we use a single global
 * shear factor so the visible color shift is monotone in
 * position index. This produces a "twist" that's easy to read
 * as "this is what position encoding does" without claiming
 * mathematical fidelity.
 *
 * The mix factor controls how much rotation is applied (0 = no
 * rotation, 1 = full position effect). Lets Scene 6 animate the
 * rotation in over t.
 */
export function applyPositionRotation(
    embedding: readonly number[],
    positionIndex: number,
    mix: number,
): number[] {
    const angle = (positionIndex * Math.PI) / 16; // arbitrary base period
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const out: number[] = new Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
        if (i % 2 === 0 && i + 1 < embedding.length) {
            // Pair-rotate (i, i+1). Compute the fully-rotated values
            // then lerp back toward the raw input by `1 - mix`, so
            // mix=0 → identity and mix=1 → full rotation.
            const x = embedding[i];
            const y = embedding[i + 1];
            const rx = cos * x - sin * y;
            const ry = sin * x + cos * y;
            out[i] = x * (1 - mix) + rx * mix;
            out[i + 1] = y * (1 - mix) + ry * mix;
        } else if (i % 2 === 1 && i + 1 >= embedding.length) {
            // Trailing odd index with no partner — pass through.
            out[i] = embedding[i];
        }
    }
    return out;
}

/**
 * Apply layer-norm-style equalization to a vector. The real
 * layer norm subtracts the mean and divides by the standard
 * deviation; we do the same here so the post-norm vector has
 * mean ≈ 0 and variance ≈ 1. Scene 7's "squish" animation
 * blends between the raw vector and this normalized form via
 * the `mix` parameter.
 */
export function layerNormalize(vector: readonly number[]): number[] {
    if (vector.length === 0) return [];
    let mean = 0;
    for (const v of vector) mean += v;
    mean /= vector.length;
    let variance = 0;
    for (const v of vector) variance += (v - mean) * (v - mean);
    variance /= vector.length;
    const std = Math.sqrt(variance + 1e-6);
    return vector.map((v) => (v - mean) / std);
}

/** Linearly interpolate two equal-length vectors. Used by
 *  Scene 7 to crossfade raw ↔ normalized representations. */
export function lerpVector(a: readonly number[], b: readonly number[], mix: number): number[] {
    const n = Math.min(a.length, b.length);
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = a[i] * (1 - mix) + b[i] * mix;
    }
    return out;
}
