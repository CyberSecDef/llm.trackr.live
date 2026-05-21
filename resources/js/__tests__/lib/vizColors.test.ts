import { describe, expect, it } from 'vitest';
import { normalize, viridisAt } from '@/lib/vizColors';

describe('viridisAt', () => {
    it('returns the first stop for t=0', () => {
        expect(viridisAt(0)).toBe('rgb(68, 1, 84)');
    });

    it('returns the last stop for t=1', () => {
        expect(viridisAt(1)).toBe('rgb(253, 231, 37)');
    });

    it('clamps t<0 to first stop and t>1 to last stop', () => {
        expect(viridisAt(-5)).toBe('rgb(68, 1, 84)');
        expect(viridisAt(2)).toBe('rgb(253, 231, 37)');
    });

    it('interpolates linearly between adjacent stops', () => {
        // Midpoint between stop 0 (#440154 = 68,1,84) and stop 1 (#3b528b = 59,82,139)
        // sits at t=0.125 (since stops are at 0, 0.25, 0.5, 0.75, 1).
        const mid = viridisAt(0.125);
        const m = mid.match(/rgb\((\d+), (\d+), (\d+)\)/);
        expect(m).not.toBeNull();
        const [, r, g, b] = m!;
        // Halfway between (68, 1, 84) and (59, 82, 139).
        expect(Math.abs(Number(r) - 64)).toBeLessThanOrEqual(1); // ~(68+59)/2
        expect(Math.abs(Number(g) - 42)).toBeLessThanOrEqual(1); // ~(1+82)/2
        expect(Math.abs(Number(b) - 112)).toBeLessThanOrEqual(1); // ~(84+139)/2
    });

    it('lands on the canonical viridis stops at the domain breakpoints', () => {
        // Domain breakpoints: 0, 0.25, 0.5, 0.75, 1.
        expect(viridisAt(0.25)).toBe('rgb(59, 82, 139)'); // #3b528b
        expect(viridisAt(0.5)).toBe('rgb(33, 145, 140)'); // #21918c
        expect(viridisAt(0.75)).toBe('rgb(94, 201, 98)'); // #5ec962
    });
});

describe('normalize', () => {
    it('maps [min, max] linearly to [0, 1]', () => {
        expect(normalize([10, 20, 30])).toEqual([0, 0.5, 1]);
    });

    it('returns [] for an empty input', () => {
        expect(normalize([])).toEqual([]);
    });

    it('handles a constant input without dividing by zero', () => {
        // All values equal → span is 0 → fall back to 0.
        const out = normalize([5, 5, 5]);
        // We map them all to the same point. The function guards
        // with `span || 1`, so the result is (5-5)/1 = 0 for each.
        expect(out).toEqual([0, 0, 0]);
    });
});
