import { describe, expect, it } from 'vitest';
import {
    applyPositionRotation,
    layerNormalize,
    lerpVector,
    syntheticEmbedding,
} from '@/lib/syntheticEmbedding';

describe('syntheticEmbedding', () => {
    it('produces a vector of the requested dim', () => {
        expect(syntheticEmbedding(42, 16)).toHaveLength(16);
        expect(syntheticEmbedding(42, 128)).toHaveLength(128);
    });

    it('is deterministic per token ID', () => {
        const a = syntheticEmbedding(42, 32);
        const b = syntheticEmbedding(42, 32);
        expect(a).toEqual(b);
    });

    it('produces different vectors for different token IDs', () => {
        const a = syntheticEmbedding(100, 32);
        const b = syntheticEmbedding(101, 32);
        // Vectors must differ at at least one position.
        const same = a.every((v, i) => v === b[i]);
        expect(same).toBe(false);
    });

    it('produces values in [-1, 1]', () => {
        const v = syntheticEmbedding(99, 256);
        for (const x of v) {
            expect(x).toBeGreaterThanOrEqual(-1);
            expect(x).toBeLessThanOrEqual(1);
        }
    });

    it('handles tokenId = 0 without all-zero output (xorshift32 invariant)', () => {
        const v = syntheticEmbedding(0, 8);
        const allZero = v.every((x) => x === 0);
        expect(allZero).toBe(false);
    });
});

describe('applyPositionRotation', () => {
    it('returns the input unchanged at mix=0', () => {
        const emb = [0.1, 0.2, 0.3, 0.4];
        const out = applyPositionRotation(emb, 5, 0);
        // cos(0) = 1, sin(0)·mix = 0 → output equals input for pairs
        expect(out[0]).toBeCloseTo(emb[0]);
        expect(out[1]).toBeCloseTo(emb[1]);
    });

    it('returns the input unchanged for position 0', () => {
        const emb = [0.1, 0.2, 0.3, 0.4];
        const out = applyPositionRotation(emb, 0, 1);
        // angle = 0 → no rotation
        expect(out[0]).toBeCloseTo(emb[0]);
        expect(out[1]).toBeCloseTo(emb[1]);
    });

    it('changes the vector for non-zero position + non-zero mix', () => {
        const emb = [0.5, 0.5, 0.5, 0.5];
        const out = applyPositionRotation(emb, 8, 1);
        // At position 8, angle = π/2 → significant rotation
        const same = out.every((v, i) => Math.abs(v - emb[i]) < 1e-6);
        expect(same).toBe(false);
    });

    it('preserves vector length', () => {
        const emb = [0.1, 0.2, 0.3, 0.4, 0.5];
        const out = applyPositionRotation(emb, 4, 0.5);
        expect(out).toHaveLength(emb.length);
    });
});

describe('layerNormalize', () => {
    it('produces a vector with mean ≈ 0', () => {
        const v = [1, 2, 3, 4, 5, 6, 7, 8];
        const out = layerNormalize(v);
        const mean = out.reduce((s, x) => s + x, 0) / out.length;
        expect(Math.abs(mean)).toBeLessThan(1e-3);
    });

    it('produces a vector with variance ≈ 1', () => {
        const v = [1, 2, 3, 4, 5, 6, 7, 8];
        const out = layerNormalize(v);
        const mean = out.reduce((s, x) => s + x, 0) / out.length;
        const variance = out.reduce((s, x) => s + (x - mean) * (x - mean), 0) / out.length;
        expect(Math.abs(variance - 1)).toBeLessThan(0.01);
    });

    it('returns [] for an empty input', () => {
        expect(layerNormalize([])).toEqual([]);
    });

    it('handles constant input without dividing by zero (ε guard)', () => {
        const out = layerNormalize([5, 5, 5, 5]);
        // All values equal → all output values ≈ 0
        for (const x of out) {
            expect(Math.abs(x)).toBeLessThan(1e-3);
        }
    });
});

describe('lerpVector', () => {
    it('returns a when mix=0', () => {
        expect(lerpVector([1, 2, 3], [10, 20, 30], 0)).toEqual([1, 2, 3]);
    });

    it('returns b when mix=1', () => {
        expect(lerpVector([1, 2, 3], [10, 20, 30], 1)).toEqual([10, 20, 30]);
    });

    it('linearly interpolates at mix=0.5', () => {
        expect(lerpVector([0, 0, 0], [10, 20, 30], 0.5)).toEqual([5, 10, 15]);
    });

    it('clamps to the shorter input length', () => {
        expect(lerpVector([1, 2, 3, 4], [10, 20], 0.5)).toHaveLength(2);
    });
});
