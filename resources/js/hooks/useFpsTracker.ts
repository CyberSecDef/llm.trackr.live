import { useEffect, useRef, useState } from 'react';

/*
 * useFpsTracker (M13 chunk 12) — RAF-driven rolling FPS measurement
 * + a degraded-mode state machine. Mounted by `CinematicViz` and
 * exposed to all viz components via `PerformanceModeContext`.
 *
 * Per `phase1.md:1038`:
 *   "< 18 FPS for 2s → degrade; > 24 FPS for 5s → restore"
 *
 * Hysteresis is intentional: a single fast frame after a degrade
 * shouldn't flip back. The restore threshold is also higher than
 * the degrade threshold so brief recoveries don't oscillate.
 *
 * Returns:
 *   { fps, degraded }
 *
 * fps:       integer rolling average over the last `windowFrames`
 *            (default 30 — same window as the M8 FpsCounter).
 * degraded:  boolean. True after sustained low frame rate; false
 *            after sustained recovery. Initial value: false.
 *
 * The state machine runs from the same RAF loop as the FPS sample,
 * so degrade/restore decisions are made every animation frame.
 */

const DEFAULT_WINDOW_FRAMES = 30;
const FPS_DEGRADE_THRESHOLD = 18;
const FPS_RESTORE_THRESHOLD = 24;
const DEGRADE_HYSTERESIS_MS = 2000;
const RESTORE_HYSTERESIS_MS = 5000;
const UPDATE_INTERVAL_MS = 250;

export interface FpsTrackerOptions {
    /** Rolling-window size in frames. Default 30. */
    windowFrames?: number;
    /** Disable the RAF loop (tests). Default: enabled when window
     *  exists, no-op under SSR. */
    enabled?: boolean;
}

export interface FpsTrackerResult {
    fps: number;
    degraded: boolean;
}

export function useFpsTracker(options: FpsTrackerOptions = {}): FpsTrackerResult {
    const { windowFrames = DEFAULT_WINDOW_FRAMES, enabled = true } = options;

    const [fps, setFps] = useState(0);
    const [degraded, setDegraded] = useState(false);

    // Refs that don't trigger re-renders.
    const frameTimesRef = useRef<number[]>([]);
    const degradedRef = useRef(degraded);
    const belowSinceRef = useRef<number | null>(null);
    const aboveSinceRef = useRef<number | null>(null);

    useEffect(() => {
        degradedRef.current = degraded;
    }, [degraded]);

    useEffect(() => {
        if (!enabled) return;
        if (typeof window === 'undefined') return;

        let raf = 0;
        let lastUpdate = performance.now();

        const tick = (now: number) => {
            const times = frameTimesRef.current;
            times.push(now);
            if (times.length > windowFrames) times.shift();

            // Update displayed FPS at most every UPDATE_INTERVAL_MS.
            if (now - lastUpdate > UPDATE_INTERVAL_MS && times.length > 1) {
                const span = times[times.length - 1] - times[0];
                const measuredFps = Math.round((times.length - 1) / (span / 1000));
                setFps(measuredFps);
                lastUpdate = now;

                // Drive the state machine. Uses degradedRef so that
                // the closure here always sees the latest mode without
                // re-subscribing the RAF loop on every state change.
                if (!degradedRef.current) {
                    if (measuredFps < FPS_DEGRADE_THRESHOLD) {
                        if (belowSinceRef.current === null) {
                            belowSinceRef.current = now;
                        } else if (now - belowSinceRef.current >= DEGRADE_HYSTERESIS_MS) {
                            setDegraded(true);
                            belowSinceRef.current = null;
                        }
                    } else {
                        belowSinceRef.current = null;
                    }
                } else {
                    if (measuredFps > FPS_RESTORE_THRESHOLD) {
                        if (aboveSinceRef.current === null) {
                            aboveSinceRef.current = now;
                        } else if (now - aboveSinceRef.current >= RESTORE_HYSTERESIS_MS) {
                            setDegraded(false);
                            aboveSinceRef.current = null;
                        }
                    } else {
                        aboveSinceRef.current = null;
                    }
                }
            }

            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [enabled, windowFrames]);

    return { fps, degraded };
}

/** Constants exported for testing + decisions-block citation. */
export const FPS_TRACKER_CONFIG = {
    DEGRADE_THRESHOLD: FPS_DEGRADE_THRESHOLD,
    RESTORE_THRESHOLD: FPS_RESTORE_THRESHOLD,
    DEGRADE_HYSTERESIS_MS,
    RESTORE_HYSTERESIS_MS,
    DEFAULT_WINDOW_FRAMES,
} as const;
