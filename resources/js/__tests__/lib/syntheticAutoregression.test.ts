import { describe, expect, it } from 'vitest';
import {
    LOOP_ITERATION_DURATIONS,
    LOOP_TOTAL_DURATION,
    iterationAtTime,
    synthesizeAutoregressiveLoop,
} from '@/lib/syntheticAutoregression';

describe('LOOP_ITERATION_DURATIONS', () => {
    it('is monotonically decreasing (decelerating pace)', () => {
        for (let i = 1; i < LOOP_ITERATION_DURATIONS.length; i++) {
            expect(LOOP_ITERATION_DURATIONS[i]).toBeLessThan(LOOP_ITERATION_DURATIONS[i - 1]);
        }
    });

    it('starts at ~2000ms (per spec: "~2s for token #2")', () => {
        expect(LOOP_ITERATION_DURATIONS[0]).toBeGreaterThanOrEqual(1500);
        expect(LOOP_ITERATION_DURATIONS[0]).toBeLessThanOrEqual(2500);
    });

    it('lands near ~200-500ms by the last iteration', () => {
        const last = LOOP_ITERATION_DURATIONS[LOOP_ITERATION_DURATIONS.length - 1];
        expect(last).toBeLessThanOrEqual(600);
        expect(last).toBeGreaterThanOrEqual(150);
    });
});

describe('LOOP_TOTAL_DURATION', () => {
    it('equals the sum of all iteration durations', () => {
        const sum = LOOP_ITERATION_DURATIONS.reduce((s, d) => s + d, 0);
        expect(LOOP_TOTAL_DURATION).toBe(sum);
    });
});

describe('synthesizeAutoregressiveLoop', () => {
    it('returns one entry per duration', () => {
        const iters = synthesizeAutoregressiveLoop(42);
        expect(iters).toHaveLength(LOOP_ITERATION_DURATIONS.length);
    });

    it('iterationIndex is 1-based and contiguous', () => {
        const iters = synthesizeAutoregressiveLoop(42);
        iters.forEach((it, i) => {
            expect(it.iterationIndex).toBe(i + 1);
        });
    });

    it('startMs is cumulative and the last entry runs up to LOOP_TOTAL', () => {
        const iters = synthesizeAutoregressiveLoop(42);
        expect(iters[0].startMs).toBe(0);
        for (let i = 1; i < iters.length; i++) {
            expect(iters[i].startMs).toBe(iters[i - 1].startMs + iters[i - 1].durationMs);
        }
        const last = iters[iters.length - 1];
        expect(last.startMs + last.durationMs).toBe(LOOP_TOTAL_DURATION);
    });

    it('is deterministic per seedKey', () => {
        const a = synthesizeAutoregressiveLoop(7);
        const b = synthesizeAutoregressiveLoop(7);
        expect(a).toEqual(b);
    });

    it('different seedKey → different vocabIndex assignments', () => {
        const a = synthesizeAutoregressiveLoop(1);
        const b = synthesizeAutoregressiveLoop(2);
        // At least one position must differ.
        let differs = false;
        for (let i = 0; i < a.length; i++) {
            if (a[i].vocabIndex !== b[i].vocabIndex) {
                differs = true;
                break;
            }
        }
        expect(differs).toBe(true);
    });

    it('vocabIndex stays within [0, 128_000)', () => {
        const iters = synthesizeAutoregressiveLoop(42);
        for (const it of iters) {
            expect(it.vocabIndex).toBeGreaterThanOrEqual(0);
            expect(it.vocabIndex).toBeLessThan(128_000);
        }
    });

    it('strings are non-empty', () => {
        const iters = synthesizeAutoregressiveLoop(42);
        for (const it of iters) {
            expect(it.string.length).toBeGreaterThan(0);
        }
    });

    it('supports custom duration arrays', () => {
        const iters = synthesizeAutoregressiveLoop(1, [100, 200, 300]);
        expect(iters).toHaveLength(3);
        expect(iters[0].durationMs).toBe(100);
        expect(iters[2].startMs).toBe(300);
    });
});

describe('iterationAtTime', () => {
    const iters = synthesizeAutoregressiveLoop(42);

    it('returns first iteration with localT=0 at t=0', () => {
        const { iteration, localT } = iterationAtTime(0, iters);
        expect(iteration?.iterationIndex).toBe(1);
        expect(localT).toBe(0);
    });

    it('returns last iteration with localT=1 at t=1', () => {
        const { iteration, localT } = iterationAtTime(1, iters);
        expect(iteration?.iterationIndex).toBe(iters.length);
        expect(localT).toBe(1);
    });

    it('returns mid-iteration iter+localT at mid-t', () => {
        // 2000ms duration; at absoluteMs=1000 we're at localT=0.5 inside iter 1.
        const t = 1000 / LOOP_TOTAL_DURATION;
        const { iteration, localT } = iterationAtTime(t, iters);
        expect(iteration?.iterationIndex).toBe(1);
        expect(localT).toBeCloseTo(0.5, 2);
    });

    it('correctly moves to the next iteration when crossing the boundary', () => {
        // At absoluteMs = 2000, we should be at the START of iter 2.
        const t = 2000 / LOOP_TOTAL_DURATION;
        const { iteration, localT } = iterationAtTime(t, iters);
        expect(iteration?.iterationIndex).toBe(2);
        expect(localT).toBe(0);
    });

    it('clamps t outside [0, 1]', () => {
        const below = iterationAtTime(-0.5, iters);
        expect(below.iteration?.iterationIndex).toBe(1);
        const above = iterationAtTime(1.5, iters);
        expect(above.iteration?.iterationIndex).toBe(iters.length);
    });

    it('returns null iteration for empty arrays', () => {
        const result = iterationAtTime(0.5, []);
        expect(result.iteration).toBeNull();
        expect(result.localT).toBe(0.5);
    });
});
