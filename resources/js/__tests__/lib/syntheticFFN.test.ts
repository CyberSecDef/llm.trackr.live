import { describe, expect, it } from 'vitest';
import {
    applyFFN,
    applyResidual,
    contractFromFFNDim,
    expandToFFNDim,
    gelu,
    pickNonlinearity,
    sparklePositions,
    swish,
} from '@/lib/syntheticFFN';

describe('gelu', () => {
    it('returns 0 at x=0', () => {
        expect(gelu(0)).toBeCloseTo(0);
    });

    it('approximates identity for large positive x', () => {
        // GELU(x) → x as x → ∞ (asymptotic, not exact). At x=10 the
        // diff is ~5e-5 which fits toBeCloseTo's 2-digit precision.
        expect(gelu(10)).toBeCloseTo(10, 2);
    });

    it('approximates 0 for large negative x', () => {
        // GELU(x) ≈ 0 for x → -∞
        expect(Math.abs(gelu(-5))).toBeLessThan(0.01);
    });

    it('is strictly monotonic on the positive half (x ∈ [0, 2])', () => {
        // GELU has a local minimum near x ≈ -0.75 then rises, so it's
        // not monotonic on a window that includes that dip. The positive
        // half is strictly monotonic and that's what the FFN viz cares
        // about (inputs are layer-normed → centered at 0 ± 1).
        let prev = gelu(0);
        for (let x = 0.1; x <= 2; x += 0.1) {
            const v = gelu(x);
            expect(v).toBeGreaterThan(prev);
            prev = v;
        }
    });
});

describe('swish', () => {
    it('returns 0 at x=0', () => {
        expect(swish(0)).toBe(0);
    });

    it('approximates x for large positive x', () => {
        // swish(x) = x/(1+e^-x). At x=10 the sigmoid is ~0.99995,
        // so swish(10) ≈ 9.9995 — within 2-digit precision.
        expect(swish(10)).toBeCloseTo(10, 2);
    });

    it('approximates 0 for large negative x', () => {
        expect(Math.abs(swish(-5))).toBeLessThan(0.05);
    });
});

describe('applyResidual', () => {
    it('element-wise sums two vectors', () => {
        expect(applyResidual([1, 2, 3], [10, 20, 30])).toEqual([11, 22, 33]);
    });

    it('clamps to the shorter input length', () => {
        expect(applyResidual([1, 2, 3, 4, 5], [10, 20])).toEqual([11, 22]);
    });

    it('returns [] when either input is empty', () => {
        expect(applyResidual([], [1, 2])).toEqual([]);
        expect(applyResidual([1, 2], [])).toEqual([]);
    });

    it('handles negatives', () => {
        expect(applyResidual([1, -2, 3], [-1, 2, -3])).toEqual([0, 0, 0]);
    });
});

describe('expandToFFNDim', () => {
    it('produces a vector of length factor × input', () => {
        const out = expandToFFNDim([0.1, 0.2, 0.3, 0.4], 4, 0);
        expect(out).toHaveLength(16);
    });

    it('is deterministic per tokenIndex', () => {
        const a = expandToFFNDim([0.1, 0.2, 0.3], 4, 7);
        const b = expandToFFNDim([0.1, 0.2, 0.3], 4, 7);
        expect(a).toEqual(b);
    });

    it('produces different output for different tokenIndex', () => {
        const a = expandToFFNDim([0.1, 0.2, 0.3], 4, 0);
        const b = expandToFFNDim([0.1, 0.2, 0.3], 4, 1);
        const allSame = a.every((v, i) => v === b[i]);
        expect(allSame).toBe(false);
    });

    it('returns [] for empty input', () => {
        expect(expandToFFNDim([], 4, 0)).toEqual([]);
    });

    it('preserves the input shape characteristics (jitter is bounded)', () => {
        // Values near 0 stay near 0; large positive stays positive.
        const out = expandToFFNDim([0.9, 0.9, 0.9, 0.9], 4, 0);
        for (const v of out) {
            expect(v).toBeGreaterThan(0.5);
            expect(v).toBeLessThan(1.2);
        }
    });
});

describe('contractFromFFNDim', () => {
    it('produces a vector of the target length', () => {
        const out = contractFromFFNDim([1, 2, 3, 4, 5, 6, 7, 8], 4);
        expect(out).toHaveLength(4);
    });

    it('averages groups of cells', () => {
        const out = contractFromFFNDim([1, 1, 3, 3], 2);
        // First half avg = 1, second half avg = 3
        expect(out[0]).toBeCloseTo(1);
        expect(out[1]).toBeCloseTo(3);
    });

    it('returns [] for zero target or empty input', () => {
        expect(contractFromFFNDim([], 4)).toEqual([]);
        expect(contractFromFFNDim([1, 2, 3], 0)).toEqual([]);
    });
});

describe('applyFFN', () => {
    it('returns a vector the same length as input', () => {
        const v = [0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7, -0.8];
        const out = applyFFN(v, 0, null);
        expect(out).toHaveLength(v.length);
    });

    it('is deterministic per (input, tokenIndex)', () => {
        const v = [0.1, 0.2, 0.3, 0.4];
        const a = applyFFN(v, 5, 'llama');
        const b = applyFFN(v, 5, 'llama');
        expect(a).toEqual(b);
    });

    it('different archType produces different output (different non-linearity)', () => {
        const v = [0.1, -0.2, 0.3, -0.4, 0.5];
        const gelued = applyFFN(v, 0, null); // GELU
        const swished = applyFFN(v, 0, 'llama'); // SwiGLU
        const allSame = gelued.every((vv, i) => Math.abs(vv - swished[i]) < 1e-8);
        expect(allSame).toBe(false);
    });

    it('returns [] for empty input', () => {
        expect(applyFFN([], 0, null)).toEqual([]);
    });
});

describe('pickNonlinearity', () => {
    it('defaults to GELU for null', () => {
        expect(pickNonlinearity(null)).toBe('GELU');
    });

    it('returns GELU for unknown / classic architectures', () => {
        expect(pickNonlinearity('transformer')).toBe('GELU');
        expect(pickNonlinearity('gpt')).toBe('GELU');
        expect(pickNonlinearity('dense')).toBe('GELU');
    });

    it('returns SwiGLU for Llama-family', () => {
        expect(pickNonlinearity('llama')).toBe('SwiGLU');
        expect(pickNonlinearity('Llama-3-70B')).toBe('SwiGLU');
        expect(pickNonlinearity('mistral-7b')).toBe('SwiGLU');
        expect(pickNonlinearity('qwen2.5')).toBe('SwiGLU');
        expect(pickNonlinearity('gemma-2b')).toBe('SwiGLU');
        expect(pickNonlinearity('phi-3')).toBe('SwiGLU');
    });

    it('returns SwiGLU for MoE architectures', () => {
        expect(pickNonlinearity('moe')).toBe('SwiGLU');
        expect(pickNonlinearity('Mixtral-8x7B-MoE')).toBe('SwiGLU');
    });
});

describe('sparklePositions', () => {
    it('returns count positions in [0, 1]²', () => {
        const sparkles = sparklePositions(0, 10);
        expect(sparkles).toHaveLength(10);
        for (const s of sparkles) {
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.x).toBeLessThanOrEqual(1);
            expect(s.y).toBeGreaterThanOrEqual(0);
            expect(s.y).toBeLessThanOrEqual(1);
        }
    });

    it('is deterministic per tokenIndex', () => {
        const a = sparklePositions(3, 5);
        const b = sparklePositions(3, 5);
        expect(a).toEqual(b);
    });

    it('returns [] for count <= 0', () => {
        expect(sparklePositions(0, 0)).toEqual([]);
        expect(sparklePositions(0, -1)).toEqual([]);
    });

    it('different tokenIndex produces different positions', () => {
        const a = sparklePositions(0, 5);
        const b = sparklePositions(1, 5);
        const allSame = a.every((s, i) => s.x === b[i].x && s.y === b[i].y);
        expect(allSame).toBe(false);
    });
});
