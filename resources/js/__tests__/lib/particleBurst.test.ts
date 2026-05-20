import { describe, expect, it } from 'vitest';
import { burstForToken } from '@/lib/particleBurst';

describe('burstForToken', () => {
    it('returns count in [5, 10]', () => {
        for (let i = 0; i < 200; i++) {
            const { count } = burstForToken(i);
            expect(count).toBeGreaterThanOrEqual(5);
            expect(count).toBeLessThanOrEqual(10);
        }
    });

    it('is deterministic across repeated calls', () => {
        for (let i = 0; i < 50; i++) {
            const a = burstForToken(i);
            const b = burstForToken(i);
            expect(a.count).toBe(b.count);
            expect(a.seed).toBe(b.seed);
        }
    });

    it('produces distinct seeds for distinct token indices (no obvious collisions)', () => {
        const seen = new Set<number>();
        for (let i = 0; i < 100; i++) {
            seen.add(burstForToken(i).seed);
        }
        // 100 inputs → at least 90 unique seeds (allowing the rare
        // xorshift collision; in practice all 100 are distinct).
        expect(seen.size).toBeGreaterThanOrEqual(90);
    });

    it('returns finite uint32 seeds', () => {
        for (let i = 0; i < 30; i++) {
            const { seed } = burstForToken(i);
            expect(Number.isFinite(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThan(2 ** 32);
        }
    });

    it('handles tokenIndex=0 (does not degenerate to seed=0)', () => {
        const { count, seed } = burstForToken(0);
        expect(count).toBeGreaterThanOrEqual(5);
        // seed of 0 would mean the xorshift never moves from 0.
        // The function guards against this by switching s=0 to s=1.
        expect(seed).not.toBe(0);
    });

    it('count distribution covers the full range across many indices', () => {
        const counts: Record<number, number> = {};
        for (let i = 0; i < 1000; i++) {
            const { count } = burstForToken(i);
            counts[count] = (counts[count] ?? 0) + 1;
        }
        // Every count value in [5, 10] should appear at least once
        // across 1000 inputs.
        for (let c = 5; c <= 10; c++) {
            expect(counts[c]).toBeGreaterThan(0);
        }
    });
});
