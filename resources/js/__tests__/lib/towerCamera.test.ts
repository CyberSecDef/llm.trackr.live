import { describe, expect, it } from 'vitest';
import {
    blurAmount,
    cameraScale,
    counterValue,
    easeOutQuad,
    packetFloor,
    towerPhase,
    TOWER_PHASE_BOUNDARIES,
} from '@/lib/towerCamera';

describe('easeOutQuad', () => {
    it('returns 0 at x=0', () => {
        expect(easeOutQuad(0)).toBe(0);
    });

    it('returns 1 at x=1', () => {
        expect(easeOutQuad(1)).toBe(1);
    });

    it('clamps below 0 to 0', () => {
        expect(easeOutQuad(-0.5)).toBe(0);
    });

    it('clamps above 1 to 1', () => {
        expect(easeOutQuad(1.5)).toBe(1);
    });

    it('is monotonically increasing', () => {
        let prev = easeOutQuad(0);
        for (let x = 0.05; x <= 1; x += 0.05) {
            const v = easeOutQuad(x);
            expect(v).toBeGreaterThanOrEqual(prev);
            prev = v;
        }
    });
});

describe('packetFloor', () => {
    it('returns 1 at t=0', () => {
        expect(packetFloor(0, 32)).toBe(1);
    });

    it('returns N at t=1', () => {
        expect(packetFloor(1, 32)).toBe(32);
    });

    it('stays at 1 throughout the reveal phase', () => {
        expect(packetFloor(0.0, 32)).toBe(1);
        expect(packetFloor(0.05, 32)).toBe(1);
        expect(packetFloor(0.099, 32)).toBe(1);
    });

    it('moves from 1 → 2 during follow phase', () => {
        expect(packetFloor(0.1, 32)).toBeCloseTo(1, 5);
        expect(packetFloor(0.15, 32)).toBeCloseTo(1.5, 1);
        expect(packetFloor(0.2, 32)).toBeCloseTo(2, 1);
    });

    it('accelerates upward through blur phase (easeOutQuad)', () => {
        const start = packetFloor(0.2, 32);
        const mid = packetFloor(0.35, 32);
        const end = packetFloor(0.5, 32);
        expect(mid).toBeGreaterThan(start);
        expect(end).toBeGreaterThan(mid);
        // Eased-out means we cover MORE ground in the first half.
        // i.e., (mid - start) > (end - mid).
        expect(mid - start).toBeGreaterThan(end - mid);
    });

    it('lands within [N-2, N] during slow phase', () => {
        const slow = packetFloor(0.65, 32);
        expect(slow).toBeGreaterThanOrEqual(30);
        expect(slow).toBeLessThanOrEqual(32);
    });

    it('arrives at N by the rezoom phase', () => {
        expect(packetFloor(0.8, 32)).toBeCloseTo(32, 0);
        expect(packetFloor(0.9, 32)).toBeCloseTo(32, 0);
        expect(packetFloor(1, 32)).toBe(32);
    });

    it('is monotonically non-decreasing across the whole scene', () => {
        let prev = packetFloor(0, 32);
        for (let t = 0; t <= 1; t += 0.02) {
            const v = packetFloor(t, 32);
            expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = v;
        }
    });

    it('handles tiny totalLayers gracefully', () => {
        expect(packetFloor(0.5, 1)).toBe(1);
        expect(packetFloor(0.5, 4)).toBeGreaterThan(0);
        expect(packetFloor(1, 4)).toBe(4);
    });

    it('clamps t outside [0, 1]', () => {
        expect(packetFloor(-0.5, 32)).toBe(1);
        expect(packetFloor(1.5, 32)).toBe(32);
    });
});

describe('cameraScale', () => {
    it('starts at 4× zoom', () => {
        expect(cameraScale(0)).toBe(4);
    });

    it('reaches 1× by the end of the reveal phase', () => {
        expect(cameraScale(0.1)).toBeCloseTo(1, 2);
    });

    it('holds at 1× through follow / blur / slow', () => {
        expect(cameraScale(0.2)).toBe(1);
        expect(cameraScale(0.4)).toBe(1);
        expect(cameraScale(0.6)).toBe(1);
        expect(cameraScale(0.79)).toBe(1);
    });

    it('re-zooms to 3× by t=1', () => {
        expect(cameraScale(1)).toBeCloseTo(3, 2);
    });

    it('interpolates smoothly through rezoom', () => {
        expect(cameraScale(0.9)).toBeCloseTo(2, 2);
    });
});

describe('counterValue', () => {
    it('returns 1 at t=0', () => {
        expect(counterValue(0, 32)).toBe(1);
    });

    it('returns N at t=1', () => {
        expect(counterValue(1, 32)).toBe(32);
    });

    it('produces integer values across the scene', () => {
        for (let t = 0; t <= 1; t += 0.01) {
            const v = counterValue(t, 32);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(32);
        }
    });

    it('handles N=80 (visualization.md example)', () => {
        expect(counterValue(0, 80)).toBe(1);
        expect(counterValue(1, 80)).toBe(80);
    });
});

describe('blurAmount', () => {
    it('is 0 outside the blur window', () => {
        expect(blurAmount(0)).toBe(0);
        expect(blurAmount(0.1)).toBe(0);
        expect(blurAmount(0.2)).toBe(0);
        expect(blurAmount(0.5)).toBe(0);
        expect(blurAmount(0.7)).toBe(0);
        expect(blurAmount(1)).toBe(0);
    });

    it('peaks at the midpoint of the blur window', () => {
        const peak = blurAmount(0.35); // midpoint of [0.2, 0.5]
        expect(peak).toBeCloseTo(1, 2);
    });

    it('is positive throughout the blur window interior', () => {
        for (let t = 0.21; t < 0.49; t += 0.02) {
            expect(blurAmount(t)).toBeGreaterThan(0);
        }
    });
});

describe('towerPhase', () => {
    it('returns the correct phase per t', () => {
        expect(towerPhase(0)).toBe('reveal');
        expect(towerPhase(0.05)).toBe('reveal');
        expect(towerPhase(0.1)).toBe('follow');
        expect(towerPhase(0.15)).toBe('follow');
        expect(towerPhase(0.2)).toBe('blur');
        expect(towerPhase(0.35)).toBe('blur');
        expect(towerPhase(0.5)).toBe('slow');
        expect(towerPhase(0.7)).toBe('slow');
        expect(towerPhase(0.8)).toBe('rezoom');
        expect(towerPhase(0.95)).toBe('rezoom');
        expect(towerPhase(1)).toBe('rezoom');
    });
});

describe('TOWER_PHASE_BOUNDARIES', () => {
    it('matches the documented phase splits', () => {
        expect(TOWER_PHASE_BOUNDARIES.REVEAL_END).toBe(0.1);
        expect(TOWER_PHASE_BOUNDARIES.FOLLOW_END).toBe(0.2);
        expect(TOWER_PHASE_BOUNDARIES.BLUR_END).toBe(0.5);
        expect(TOWER_PHASE_BOUNDARIES.SLOW_END).toBe(0.8);
    });
});
