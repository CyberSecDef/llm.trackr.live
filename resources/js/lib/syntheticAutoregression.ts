/*
 * syntheticAutoregression (M13 chunk 9a) — helpers for Scene 18's
 * autoregressive-loop animation.
 *
 * After Scene 17 emits the first generated token, Scene 18 plays a
 * compressed-replay montage of N more loop iterations at decelerating
 * pace. Each iteration emits one synthetic token; the durations
 * follow the spec's "~2s for token #2, accelerating to ~200ms/token
 * by token #10+".
 *
 * For chunk 9a's visualization the math doesn't need to mirror a
 * real LLM step — we just need:
 *   - a deterministic list of (vocabIndex, string, durationMs) per
 *     iteration so the animation is replay-stable,
 *   - a helper that maps the scene's normalized t ∈ [0, 1] back to
 *     the current iteration index + a local 0..1 sub-t.
 *
 * Chunk 10 will replace `synthesizeAutoregressiveLoop()` with a
 * driver that takes timing from the WebSocket stream. The function
 * signature stays the same.
 */

import { syntheticTokenString } from '@/lib/syntheticLogits';

/**
 * Per-iteration durations in ms. The decelerating curve covers the
 * spec's "~2s for #2, ~1.5s for #3, accelerating to ~200ms/token by
 * #10+". Sum = 6900 ms (round to 7000 for the scene duration).
 */
export const LOOP_ITERATION_DURATIONS: readonly number[] = [2000, 1500, 1100, 800, 600, 500, 400];

export const LOOP_TOTAL_DURATION = LOOP_ITERATION_DURATIONS.reduce((s, d) => s + d, 0);

export interface LoopIteration {
    /** Index in the loop sequence (1-based: first synthesized iter
     *  is #1, since Scene 17 already emitted token #0). */
    iterationIndex: number;
    /** Synthetic vocab id, picked from the synthetic token bank. */
    vocabIndex: number;
    /** Display string for the chat-tray + reverse-lookup widget. */
    string: string;
    /** Wall-clock duration of this iteration in ms. */
    durationMs: number;
    /** Start ms within the scene's t-window (0 = scene start). */
    startMs: number;
}

/**
 * Build the full list of loop iterations for Scene 18. Deterministic
 * per `(seedKey, durations.length)`; the same prompt produces the
 * same continuation on every replay.
 *
 * Token strings are drawn from the synthetic bank in
 * `lib/syntheticLogits.ts` so they read as plausible English
 * fragments. Vocab indices are a stable hash of `(seedKey, iter)`.
 */
export function synthesizeAutoregressiveLoop(
    seedKey: number,
    durations: readonly number[] = LOOP_ITERATION_DURATIONS,
): LoopIteration[] {
    let startMs = 0;
    return durations.map((durationMs, i) => {
        const iterationIndex = i + 1;
        // xorshift32-ish mix of (seedKey, i) so consecutive iters
        // land on different bank entries; cycles through the bank.
        let s = ((seedKey | 0) * 0x9e3779b9) ^ (iterationIndex * 0xbeef);
        if (s === 0) s = 1;
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        const vocabIndex = Math.abs(s >>> 0) % 128_000;
        const rank = iterationIndex; // 1..N; bank wraps internally
        const result: LoopIteration = {
            iterationIndex,
            vocabIndex,
            string: syntheticTokenString(rank),
            durationMs,
            startMs,
        };
        startMs += durationMs;
        return result;
    });
}

/**
 * Map the scene's `t ∈ [0, 1]` to which iteration is active + a
 * local sub-t ∈ [0, 1] inside that iteration.
 *
 * If t lands past the last iteration's window (i.e., t ≈ 1), returns
 * the last iteration with `localT = 1`. If `iterations` is empty,
 * returns `{ iterationIndex: 0, localT: t }`.
 */
export function iterationAtTime(
    t: number,
    iterations: readonly LoopIteration[],
): { iteration: LoopIteration | null; localT: number; absoluteMs: number } {
    if (iterations.length === 0) {
        return { iteration: null, localT: Math.max(0, Math.min(1, t)), absoluteMs: 0 };
    }
    const total =
        iterations[iterations.length - 1].startMs + iterations[iterations.length - 1].durationMs;
    const absoluteMs = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < iterations.length; i++) {
        const iter = iterations[i];
        const iterEnd = iter.startMs + iter.durationMs;
        if (absoluteMs < iterEnd || i === iterations.length - 1) {
            const localT = (absoluteMs - iter.startMs) / Math.max(1, iter.durationMs);
            return {
                iteration: iter,
                localT: Math.max(0, Math.min(1, localT)),
                absoluteMs,
            };
        }
    }
    // Shouldn't reach — defensive.
    return {
        iteration: iterations[iterations.length - 1],
        localT: 1,
        absoluteMs,
    };
}
