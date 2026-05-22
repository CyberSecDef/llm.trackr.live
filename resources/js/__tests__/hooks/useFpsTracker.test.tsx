import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FPS_TRACKER_CONFIG, useFpsTracker } from '@/hooks/useFpsTracker';

/*
 * Tests for the chunk-12 FPS tracker + degraded-mode state machine.
 *
 * The hook uses requestAnimationFrame; jsdom doesn't drive real
 * frames so we control time + RAF callbacks manually. Each test
 * walks the hook through a sequence of frames at chosen intervals
 * and asserts the boundary conditions documented in the spec:
 *   < 18 FPS for 2s → degrade
 *   > 24 FPS for 5s → restore
 */

type RafCallback = (now: number) => void;

let now = 0;
let callbacks: { id: number; fn: RafCallback }[] = [];
let nextId = 1;

beforeEach(() => {
    now = 0;
    callbacks = [];
    nextId = 1;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn: FrameRequestCallback) => {
        const id = nextId++;
        callbacks.push({ id, fn });
        return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
        callbacks = callbacks.filter((c) => c.id !== id);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Advance time by `dt` ms and drain queued RAFs once. */
function advance(dt: number) {
    now += dt;
    const pending = callbacks;
    callbacks = [];
    pending.forEach(({ fn }) => fn(now));
}

describe('useFpsTracker — config', () => {
    it('exports the spec thresholds', () => {
        expect(FPS_TRACKER_CONFIG.DEGRADE_THRESHOLD).toBe(18);
        expect(FPS_TRACKER_CONFIG.RESTORE_THRESHOLD).toBe(24);
        expect(FPS_TRACKER_CONFIG.DEGRADE_HYSTERESIS_MS).toBe(2000);
        expect(FPS_TRACKER_CONFIG.RESTORE_HYSTERESIS_MS).toBe(5000);
    });
});

describe('useFpsTracker — initial state', () => {
    it('returns fps=0 and degraded=false before any frames', () => {
        const { result } = renderHook(() => useFpsTracker());
        expect(result.current.fps).toBe(0);
        expect(result.current.degraded).toBe(false);
    });
});

describe('useFpsTracker — state machine', () => {
    it('degrades after 2s sustained < 18 FPS', () => {
        const { result } = renderHook(() => useFpsTracker());
        // 5 FPS = 200ms per frame, well below the 18 threshold.
        // Advance 30 frames @ 200ms each = 6000ms total. We need at
        // least 2s of below-threshold readings + an update tick.
        act(() => {
            for (let i = 0; i < 30; i++) advance(200);
        });
        expect(result.current.fps).toBeLessThan(18);
        expect(result.current.degraded).toBe(true);
    });

    it('does NOT degrade after a single brief dip < 2s', () => {
        const { result } = renderHook(() => useFpsTracker());
        // 4 frames of slow then back to 60 FPS for ~3s. Not enough
        // sustained low-FPS time to trip the degrade boundary.
        act(() => {
            for (let i = 0; i < 4; i++) advance(200); // ~800ms slow
            for (let i = 0; i < 180; i++) advance(16.67); // ~3s at 60 FPS
        });
        expect(result.current.degraded).toBe(false);
    });

    it('restores after 5s sustained > 24 FPS once degraded', () => {
        const { result } = renderHook(() => useFpsTracker());
        // Step 1: get into degraded mode.
        act(() => {
            for (let i = 0; i < 30; i++) advance(200);
        });
        expect(result.current.degraded).toBe(true);

        // Step 2: ~6s at 60 FPS to clear the restore threshold.
        act(() => {
            for (let i = 0; i < 360; i++) advance(16.67);
        });
        expect(result.current.degraded).toBe(false);
    });

    it('hysteresis: a 1s recovery does NOT restore', () => {
        const { result } = renderHook(() => useFpsTracker());
        act(() => {
            for (let i = 0; i < 30; i++) advance(200);
        });
        expect(result.current.degraded).toBe(true);

        // Only ~1s of fast frames — not enough to clear the 5s
        // restore hysteresis. Should stay degraded.
        act(() => {
            for (let i = 0; i < 60; i++) advance(16.67);
        });
        expect(result.current.degraded).toBe(true);
    });
});

describe('useFpsTracker — fps measurement', () => {
    it('reports approximately 60 FPS for 16.67ms frames', () => {
        const { result } = renderHook(() => useFpsTracker());
        act(() => {
            for (let i = 0; i < 60; i++) advance(16.67);
        });
        // Tolerance: rolling window + integer rounding.
        expect(result.current.fps).toBeGreaterThanOrEqual(55);
        expect(result.current.fps).toBeLessThanOrEqual(65);
    });

    it('reports lower FPS as frame intervals widen', () => {
        const { result } = renderHook(() => useFpsTracker());
        act(() => {
            for (let i = 0; i < 30; i++) advance(40); // 25 FPS
        });
        expect(result.current.fps).toBeGreaterThanOrEqual(20);
        expect(result.current.fps).toBeLessThanOrEqual(30);
    });
});

describe('useFpsTracker — disable', () => {
    it('skips the RAF loop when enabled=false', () => {
        const { result } = renderHook(() => useFpsTracker({ enabled: false }));
        // No frames queued — loop never started.
        expect(callbacks.length).toBe(0);
        act(() => advance(5000));
        expect(result.current.fps).toBe(0);
    });
});
