import { describe, expect, it } from 'vitest';
import {
    sampleByMode,
    softmax,
    syntheticTokenString,
    topPCutoffIndex,
} from '@/lib/syntheticLogits';

describe('softmax', () => {
    it('produces probabilities summing to ~1', () => {
        const probs = softmax([1, 2, 3, 4]);
        const sum = probs.reduce((s, v) => s + v, 0);
        expect(sum).toBeCloseTo(1, 5);
    });

    it('preserves order: higher logit → higher probability', () => {
        const probs = softmax([5, 1, 3, 4]);
        // Logits at indices: [5, 1, 3, 4]. Expected prob order by
        // index = 0 (logit 5) > 3 (logit 4) > 2 (logit 3) > 1 (logit 1).
        expect(probs[0]).toBeGreaterThan(probs[3]);
        expect(probs[3]).toBeGreaterThan(probs[2]);
        expect(probs[2]).toBeGreaterThan(probs[1]);
    });

    it('low temperature sharpens (top-1 dominates more)', () => {
        const logits = [3, 2, 1];
        const sharp = softmax(logits, 0.1);
        const flat = softmax(logits, 10);
        expect(sharp[0]).toBeGreaterThan(flat[0]);
    });

    it('handles negative logits', () => {
        const probs = softmax([-5, -3, -1]);
        const sum = probs.reduce((s, v) => s + v, 0);
        expect(sum).toBeCloseTo(1, 5);
    });

    it('is numerically stable for large values', () => {
        const probs = softmax([1000, 999, 998]);
        expect(probs.every((p) => !Number.isNaN(p))).toBe(true);
        expect(probs.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
    });

    it('returns [] for empty input', () => {
        expect(softmax([])).toEqual([]);
    });

    it('handles zero/negative temperature gracefully', () => {
        const probs = softmax([1, 2, 3], 0);
        const sum = probs.reduce((s, v) => s + v, 0);
        expect(sum).toBeCloseTo(1, 5);
        expect(probs.every((p) => !Number.isNaN(p))).toBe(true);
    });
});

describe('topPCutoffIndex', () => {
    it('returns 0 when first element already exceeds p', () => {
        expect(topPCutoffIndex([0.9, 0.05, 0.05], 0.5)).toBe(0);
    });

    it('finds the cumulative-p cutoff', () => {
        // [0.4, 0.3, 0.2, 0.1], p=0.7 → cum 0.4, 0.7 → index 1
        expect(topPCutoffIndex([0.4, 0.3, 0.2, 0.1], 0.7)).toBe(1);
    });

    it('returns last index if cumulative never reaches p', () => {
        // p=1.5 isn't reachable; returns last
        expect(topPCutoffIndex([0.3, 0.3, 0.4], 1.5)).toBe(2);
    });

    it('handles empty array', () => {
        expect(topPCutoffIndex([], 0.5)).toBe(0);
    });

    it('clamps p to [0, 1]', () => {
        expect(topPCutoffIndex([0.5, 0.5], -0.5)).toBe(0);
        expect(topPCutoffIndex([0.5, 0.5], 2)).toBe(1);
    });
});

describe('sampleByMode', () => {
    const probs = [0.5, 0.2, 0.15, 0.1, 0.05]; // sorted descending

    it('greedy always returns 0', () => {
        expect(sampleByMode(probs, 'greedy', 40, 0.95, 0)).toBe(0);
        expect(sampleByMode(probs, 'greedy', 40, 0.95, 42)).toBe(0);
    });

    it('top_k restricts to first k indices', () => {
        // Across 50 seeds with k=2, only indices 0 or 1 should appear.
        const results = new Set<number>();
        for (let seed = 0; seed < 50; seed++) {
            results.add(sampleByMode(probs, 'top_k', 2, 0.95, seed));
        }
        for (const r of results) {
            expect(r).toBeLessThan(2);
        }
    });

    it('top_p restricts to cumulative-p prefix', () => {
        // [0.5, 0.2, 0.15, 0.1, 0.05], p=0.7 → cumulative cutoff at index 1
        // So only indices 0 and 1 should appear.
        const results = new Set<number>();
        for (let seed = 0; seed < 50; seed++) {
            results.add(sampleByMode(probs, 'top_p', 40, 0.7, seed));
        }
        for (const r of results) {
            expect(r).toBeLessThanOrEqual(1);
        }
    });

    it('is deterministic per seed', () => {
        const a = sampleByMode(probs, 'top_k', 3, 0.9, 7);
        const b = sampleByMode(probs, 'top_k', 3, 0.9, 7);
        expect(a).toBe(b);
    });

    it('returns 0 for empty distribution', () => {
        expect(sampleByMode([], 'greedy', 40, 0.95, 0)).toBe(0);
    });

    it('clamps k to distribution length', () => {
        const small = [0.6, 0.4];
        const results = new Set<number>();
        for (let seed = 0; seed < 30; seed++) {
            results.add(sampleByMode(small, 'top_k', 100, 0.95, seed));
        }
        for (const r of results) {
            expect(r).toBeLessThan(small.length);
        }
    });
});

describe('syntheticTokenString', () => {
    it('returns a non-empty string for any rank', () => {
        for (let i = 0; i < 30; i++) {
            const s = syntheticTokenString(i);
            expect(s.length).toBeGreaterThan(0);
        }
    });

    it('wraps around when rank exceeds bank size', () => {
        const s0 = syntheticTokenString(0);
        const s16 = syntheticTokenString(16);
        expect(s0).toBe(s16);
    });

    it('handles negative ranks', () => {
        expect(syntheticTokenString(-1).length).toBeGreaterThan(0);
    });

    it('is deterministic per rank', () => {
        expect(syntheticTokenString(3)).toBe(syntheticTokenString(3));
    });
});
