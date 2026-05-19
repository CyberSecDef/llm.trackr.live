import { describe, expect, it } from 'vitest';
import { generateAttentionPattern } from '@/lib/attentionPattern';

/*
 * attentionPattern — properties to enforce:
 *  - shape: n×n
 *  - causal mask: upper triangle is zero
 *  - row stochastic: each row sums to 1 (over its causal prefix)
 *  - deterministic: same inputs → same output
 *  - distance-decay: closer tokens have higher weight (per row)
 *  - depth widens the receptive field
 */

describe('generateAttentionPattern', () => {
    it('returns an empty matrix when tokenCount is 0', () => {
        expect(generateAttentionPattern(0, 0, 12)).toEqual([]);
    });

    it('returns 1x1 [[1]] when tokenCount is 1', () => {
        const m = generateAttentionPattern(1, 0, 12);
        expect(m).toHaveLength(1);
        expect(m[0]).toHaveLength(1);
        expect(m[0][0]).toBeCloseTo(1, 6);
    });

    it('produces an N×N matrix', () => {
        const m = generateAttentionPattern(16, 5, 32);
        expect(m).toHaveLength(16);
        for (const row of m) expect(row).toHaveLength(16);
    });

    it('respects the causal mask (upper triangle is zero)', () => {
        const m = generateAttentionPattern(10, 2, 24);
        for (let i = 0; i < 10; i++) {
            for (let j = i + 1; j < 10; j++) {
                expect(m[i][j]).toBe(0);
            }
        }
    });

    it('each row sums to 1 (probability distribution per query)', () => {
        const m = generateAttentionPattern(20, 6, 24);
        for (let i = 0; i < 20; i++) {
            const sum = m[i].reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1, 5);
        }
    });

    it('is deterministic for the same (tokenCount, layerIndex, totalLayers)', () => {
        const a = generateAttentionPattern(12, 4, 24);
        const b = generateAttentionPattern(12, 4, 24);
        expect(a).toEqual(b);
    });

    it('differs across layers (different layerIndex → different pattern)', () => {
        const a = generateAttentionPattern(12, 0, 24);
        const b = generateAttentionPattern(12, 20, 24);
        // Same dims but content differs — at least one cell deviates.
        let anyDiff = false;
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < a[i].length; j++) {
                if (Math.abs(a[i][j] - b[i][j]) > 0.001) {
                    anyDiff = true;
                    break;
                }
            }
            if (anyDiff) break;
        }
        expect(anyDiff).toBe(true);
    });

    it('produces a deeper receptive field at later layers (mean distance grows)', () => {
        // For the last row (i = n-1), the "effective distance" =
        // sum_j w[i][j] * (i - j). Earlier layers concentrate weight
        // near j = i; later layers spread further back.
        const tokens = 40;
        const total = 32;
        const early = generateAttentionPattern(tokens, 0, total, { noise: 0 });
        const late = generateAttentionPattern(tokens, total - 1, total, { noise: 0 });

        const lastRow = tokens - 1;
        const meanDistEarly = early[lastRow].reduce((acc, w, j) => acc + w * (lastRow - j), 0);
        const meanDistLate = late[lastRow].reduce((acc, w, j) => acc + w * (lastRow - j), 0);
        expect(meanDistLate).toBeGreaterThan(meanDistEarly);
    });

    it('weight is monotonically (roughly) decreasing with distance when noise is off', () => {
        const m = generateAttentionPattern(20, 5, 24, { noise: 0 });
        const row = m[19]; // last query
        // From j=19 backward, each w[19][j] should be >= w[19][j-1]
        // (because j=19 is closest to itself, j=0 is farthest).
        for (let j = 19; j > 0; j--) {
            expect(row[j]).toBeGreaterThanOrEqual(row[j - 1]);
        }
    });
});
