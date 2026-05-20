/*
 * particleBurst (M9 chunk 2) — deterministic per-token burst params.
 *
 * The chunk-3 ParticleSystem can take an optional seed for X/Z
 * jitter. To make replay frame-identical (SPEC §10.1) the burst
 * size + spawn seed both need to be a pure function of the token's
 * position in the run. This helper derives both from `tokenIndex`
 * via a fast xorshift32 hash, returning a deterministic
 * `{ count, seed }` pair the events-watcher passes to
 * `particles.spawnBurst(count, seed)`.
 *
 * The hash is intentionally cheap (single function call, no global
 * state, no allocation) — burst derivation runs per token.received
 * event during streaming AND every time replay scrubs forward.
 */

const MIN_BURST = 5;
const MAX_BURST = 10;
const BURST_RANGE = MAX_BURST - MIN_BURST + 1;

export interface BurstParams {
    /** Number of particles to spawn — between MIN_BURST and MAX_BURST. */
    count: number;
    /** Seed for the spawn's X/Z jitter — replay-deterministic. */
    seed: number;
}

/**
 * Derive (count, seed) from a token's index in the run.
 *
 * Deterministic: identical inputs → identical outputs across the
 * page lifetime, multiple replays, and multiple machines.
 */
export function burstForToken(tokenIndex: number): BurstParams {
    // xorshift32 starting from a uint32 derived from tokenIndex.
    // Multiply by the golden-ratio uint32 to spread small indices
    // across the state space.
    let s = ((tokenIndex >>> 0) * 0x9e3779b9) >>> 0;
    if (s === 0) s = 1; // xorshift on 0 stays 0
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;

    const count = MIN_BURST + (s % BURST_RANGE);

    // Second iteration → seed independent from the count derivation
    // so the burst RNG state isn't correlated with the count.
    let seedState = s;
    seedState ^= seedState << 13;
    seedState ^= seedState >>> 17;
    seedState ^= seedState << 5;
    const seed = seedState >>> 0;

    return { count, seed };
}
