import { describe, expect, it } from 'vitest';
import { subComponentsFor } from '@/Components/Viz/subComponents';

describe('subComponentsFor', () => {
    it('returns the dense 5-step sequence for dense architectures', () => {
        const subs = subComponentsFor('dense');
        expect(subs.map((s) => s.name)).toEqual([
            'RMSNorm',
            'Attention',
            'Residual',
            'FFN',
            'Residual',
        ]);
    });

    it('swaps in MoE Router → Experts for moe architectures', () => {
        const subs = subComponentsFor('moe');
        expect(subs.map((s) => s.name)).toEqual([
            'RMSNorm',
            'Attention',
            'Residual',
            'MoE Router → Experts',
            'Residual',
        ]);
    });

    it('defaults to the dense sequence for null / unknown values', () => {
        expect(subComponentsFor(null).map((s) => s.name)).toContain('FFN');
        expect(subComponentsFor(undefined).map((s) => s.name)).toContain('FFN');
        expect(subComponentsFor('mamba').map((s) => s.name)).toContain('FFN');
    });
});
