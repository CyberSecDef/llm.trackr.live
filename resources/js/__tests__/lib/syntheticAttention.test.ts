import { describe, expect, it } from 'vitest';
import { blendValues, generateMultiHeadMatrices, splitQKV } from '@/lib/syntheticAttention';

describe('splitQKV', () => {
    const emb = [0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7, -0.8];

    it('returns Q, K, V all matching the input dim', () => {
        const triple = splitQKV(emb, 0);
        expect(triple.q).toHaveLength(emb.length);
        expect(triple.k).toHaveLength(emb.length);
        expect(triple.v).toHaveLength(emb.length);
    });

    it('preserves cell magnitudes (sign-flip mask only)', () => {
        const triple = splitQKV(emb, 0);
        for (let i = 0; i < emb.length; i++) {
            expect(Math.abs(triple.q[i])).toBeCloseTo(Math.abs(emb[i]));
            expect(Math.abs(triple.k[i])).toBeCloseTo(Math.abs(emb[i]));
            expect(Math.abs(triple.v[i])).toBeCloseTo(Math.abs(emb[i]));
        }
    });

    it('produces visibly distinct Q / K / V (not the same sign pattern)', () => {
        const triple = splitQKV(emb, 3);
        // At least one position should differ in sign across the triple
        const qAllSameAsK = triple.q.every((v, i) => v === triple.k[i]);
        const qAllSameAsV = triple.q.every((v, i) => v === triple.v[i]);
        expect(qAllSameAsK).toBe(false);
        expect(qAllSameAsV).toBe(false);
    });

    it('is deterministic per (tokenIndex, headIndex)', () => {
        const a = splitQKV(emb, 5, 2);
        const b = splitQKV(emb, 5, 2);
        expect(a.q).toEqual(b.q);
        expect(a.k).toEqual(b.k);
        expect(a.v).toEqual(b.v);
    });

    it('produces different triples for different token indexes', () => {
        const t0 = splitQKV(emb, 0);
        const t1 = splitQKV(emb, 1);
        const same = t0.q.every((v, i) => v === t1.q[i]);
        expect(same).toBe(false);
    });

    it('produces different triples for different head indexes', () => {
        const h0 = splitQKV(emb, 4, 0);
        const h7 = splitQKV(emb, 4, 7);
        const same = h0.q.every((v, i) => v === h7.q[i]);
        expect(same).toBe(false);
    });

    it('handles empty embedding without throwing', () => {
        const triple = splitQKV([], 0);
        expect(triple.q).toEqual([]);
        expect(triple.k).toEqual([]);
        expect(triple.v).toEqual([]);
    });
});

describe('generateMultiHeadMatrices', () => {
    it('returns one matrix per head with N×N shape', () => {
        const heads = generateMultiHeadMatrices(5, 6);
        expect(heads).toHaveLength(6);
        for (const matrix of heads) {
            expect(matrix).toHaveLength(5);
            for (const row of matrix) expect(row).toHaveLength(5);
        }
    });

    it('every head matrix is causal (upper triangle zero)', () => {
        const heads = generateMultiHeadMatrices(8, 4);
        for (const matrix of heads) {
            for (let i = 0; i < matrix.length; i++) {
                for (let j = i + 1; j < matrix.length; j++) {
                    expect(matrix[i][j]).toBe(0);
                }
            }
        }
    });

    it('every row sums to ~1 in every head (post-softmax invariant)', () => {
        const heads = generateMultiHeadMatrices(6, 4);
        for (const matrix of heads) {
            for (const row of matrix) {
                const sum = row.reduce((s, v) => s + v, 0);
                expect(Math.abs(sum - 1)).toBeLessThan(1e-3);
            }
        }
    });

    it('different heads produce different matrices', () => {
        const heads = generateMultiHeadMatrices(6, 4);
        // Head 0 vs head 1 should differ at least somewhere
        let differs = false;
        for (let i = 0; i < heads[0].length; i++) {
            for (let j = 0; j < heads[0][i].length; j++) {
                if (Math.abs(heads[0][i][j] - heads[1][i][j]) > 1e-6) {
                    differs = true;
                    break;
                }
            }
            if (differs) break;
        }
        expect(differs).toBe(true);
    });

    it('returns [] for zero tokens or zero heads', () => {
        expect(generateMultiHeadMatrices(0, 6)).toEqual([]);
        expect(generateMultiHeadMatrices(5, 0)).toEqual([]);
    });

    it('is deterministic across calls', () => {
        const a = generateMultiHeadMatrices(5, 3);
        const b = generateMultiHeadMatrices(5, 3);
        expect(a).toEqual(b);
    });
});

describe('blendValues', () => {
    it('weighted-sums V vectors by the attention row', () => {
        const values = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
        ];
        // Row 0 attends fully to position 0
        // Row 1: 0.5/0.5 split between positions 0 and 1
        // Row 2: equal weights across all 3
        const attention = [
            [1, 0, 0],
            [0.5, 0.5, 0],
            [1 / 3, 1 / 3, 1 / 3],
        ];
        const out = blendValues(values, attention);
        expect(out[0]).toEqual([1, 0, 0]);
        expect(out[1][0]).toBeCloseTo(0.5);
        expect(out[1][1]).toBeCloseTo(0.5);
        expect(out[2][0]).toBeCloseTo(1 / 3);
        expect(out[2][1]).toBeCloseTo(1 / 3);
        expect(out[2][2]).toBeCloseTo(1 / 3);
    });

    it('respects causal mask (skips j>i since row[j] is zero)', () => {
        const values = [
            [10, 0],
            [0, 10],
        ];
        const attention = [
            [1, 0], // row 0: only sees position 0
            [0.3, 0.7], // row 1: weighted blend
        ];
        const out = blendValues(values, attention);
        expect(out[0]).toEqual([10, 0]);
        expect(out[1][0]).toBeCloseTo(3);
        expect(out[1][1]).toBeCloseTo(7);
    });

    it('returns [] when either input is empty', () => {
        expect(blendValues([], [[1]])).toEqual([]);
        expect(blendValues([[1]], [])).toEqual([]);
    });

    it('produces one output row per attention row', () => {
        const values = [
            [1, 1],
            [2, 2],
            [3, 3],
        ];
        const attention = [
            [1, 0, 0],
            [0.5, 0.5, 0],
        ];
        const out = blendValues(values, attention);
        expect(out).toHaveLength(attention.length);
        expect(out[0]).toHaveLength(values[0].length);
    });
});
