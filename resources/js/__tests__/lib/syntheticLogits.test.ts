import { describe, expect, it } from 'vitest';
import { downsampleLogits, pickTopK, synthesizeLogits } from '@/lib/syntheticLogits';

describe('synthesizeLogits', () => {
    const lastVec = [0.1, -0.2, 0.3, -0.4, 0.5];

    it('returns values of length vocabSize', () => {
        const { values } = synthesizeLogits(lastVec, 1000, 42);
        expect(values).toHaveLength(1000);
    });

    it('returns the requested number of top indices', () => {
        const { topIndices } = synthesizeLogits(lastVec, 1000, 42, 20);
        expect(topIndices).toHaveLength(20);
    });

    it('top indices are sorted descending by value', () => {
        const { values, topIndices } = synthesizeLogits(lastVec, 1000, 42, 10);
        for (let i = 0; i < topIndices.length - 1; i++) {
            expect(values[topIndices[i]]).toBeGreaterThanOrEqual(values[topIndices[i + 1]]);
        }
    });

    it('top values are dramatically larger than the average (sparse distribution)', () => {
        const { values, topIndices } = synthesizeLogits(lastVec, 5000, 42, 8);
        const top1 = values[topIndices[0]];
        const avg = values.reduce((s, v) => s + v, 0) / values.length;
        // Top-1 should be way above average — that's the "hot spike" beat.
        expect(top1).toBeGreaterThan(avg * 5);
    });

    it('is deterministic per (lastVector, vocabSize, seedKey)', () => {
        const a = synthesizeLogits(lastVec, 500, 7);
        const b = synthesizeLogits(lastVec, 500, 7);
        expect(a.values).toEqual(b.values);
        expect(a.topIndices).toEqual(b.topIndices);
    });

    it('different lastVector → different distribution', () => {
        const a = synthesizeLogits([0.1, 0.2, 0.3], 500, 7);
        const b = synthesizeLogits([0.9, -0.9, 0.5], 500, 7);
        // Top-1 indices should differ.
        expect(a.topIndices[0]).not.toBe(b.topIndices[0]);
    });

    it('returns empty for vocabSize <= 0', () => {
        const { values, topIndices } = synthesizeLogits(lastVec, 0, 42);
        expect(values).toEqual([]);
        expect(topIndices).toEqual([]);
    });

    it('produces values mostly in the cool range with sparse spikes', () => {
        const { values, topIndices } = synthesizeLogits(lastVec, 2000, 42);
        const coldThreshold = 0.5;
        const coldCount = values.filter((v) => Math.abs(v) < coldThreshold).length;
        // Most of the array should be "cool" (low magnitude).
        expect(coldCount / values.length).toBeGreaterThan(0.9);
        // Top-1 should clearly exceed the cold threshold.
        expect(values[topIndices[0]]).toBeGreaterThan(coldThreshold);
    });
});

describe('downsampleLogits', () => {
    it('returns the input unchanged when shorter than target', () => {
        const out = downsampleLogits([1, 2, 3], 10);
        expect(out).toEqual([1, 2, 3]);
    });

    it('max-pools to the target length', () => {
        const out = downsampleLogits([1, 2, 3, 4, 5, 6, 7, 8], 2);
        expect(out).toHaveLength(2);
        // First half max = 4, second half max = 8.
        expect(out[0]).toBe(4);
        expect(out[1]).toBe(8);
    });

    it('preserves spikes (the visualization invariant)', () => {
        const input = new Array(1000).fill(0);
        input[500] = 99; // hot spike in the middle
        const out = downsampleLogits(input, 50);
        expect(Math.max(...out)).toBe(99);
    });

    it('returns [] for empty input or zero target', () => {
        expect(downsampleLogits([], 10)).toEqual([]);
        expect(downsampleLogits([1, 2, 3], 0)).toEqual([]);
    });
});

describe('pickTopK', () => {
    it('returns the k largest with indices, sorted desc', () => {
        const result = pickTopK([1, 5, 3, 8, 2, 7], 3);
        expect(result).toEqual([
            { value: 8, index: 3 },
            { value: 7, index: 5 },
            { value: 5, index: 1 },
        ]);
    });

    it('returns [] for k <= 0', () => {
        expect(pickTopK([1, 2, 3], 0)).toEqual([]);
        expect(pickTopK([1, 2, 3], -1)).toEqual([]);
    });

    it('returns [] for empty input', () => {
        expect(pickTopK([], 5)).toEqual([]);
    });

    it('handles k larger than input length', () => {
        const result = pickTopK([3, 1, 2], 10);
        expect(result).toHaveLength(3);
        expect(result[0].value).toBe(3);
    });
});
