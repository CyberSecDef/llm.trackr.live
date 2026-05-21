import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCENE_IDS, type SceneId } from '@/Components/Viz/Scene';

/*
 * useSceneRunner (M13 chunk 1) — state machine that walks the 20
 * scenes from `docs/visualization.md`.
 *
 * Skeleton in chunk 1: the runner owns the scene index, the
 * normalized time `t ∈ [0, 1]` within the current scene, the speed
 * multiplier (0.25 / 1 / 4 ×), pause state, and exposes controls
 * for scrub / setScene / setSpeed / toggle play. No real scene
 * content runs through it yet — chunks 3-9 register scenes; chunk
 * 11 adapts the existing PlaybackControls to invoke these controls.
 *
 * Why a hook, not a Context or class instance:
 *   - Matches the existing M8 pattern (useEventPlayback, useRunStream).
 *   - Tests stay pure-React (renderHook from @testing-library/react).
 *   - Persistent UI sections can either read the same hook
 *     (separate subscription) OR receive state via props from the
 *     CinematicViz parent. Per-mount hook instances stay cheap.
 *
 * State machine, simplified:
 *
 *     ┌──────────────────────────────────────────┐
 *     │ sceneIndex = 0..(SCENE_IDS.length - 1)   │
 *     │ t = 0..1 (advances at speed × dt / dur)  │
 *     │ playing = bool                           │
 *     │ speed = 0.25 | 1 | 4                     │
 *     └──────────────────────────────────────────┘
 *
 *   tick:
 *     if (!playing) return
 *     t += (deltaMs * speed) / sceneDurationMs
 *     if (t >= 1):
 *         sceneIndex = min(sceneIndex + 1, last)
 *         t = 0
 *
 * Per-scene duration comes from the registered scene's `durationMs`
 * (chunks 3-9). Until scenes are registered, we use a default of
 * 2000ms so the skeleton can be exercised in tests.
 */

export const PLAYBACK_SPEEDS = [0.25, 1, 4] as const;
export type SceneSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface SceneRunnerState {
    sceneIndex: number;
    /** Stable id of the current scene; convenience derived from sceneIndex. */
    sceneId: SceneId;
    /** Normalized progress within the current scene, [0, 1]. */
    t: number;
    playing: boolean;
    speed: SceneSpeed;
    /** Total scene count (always SCENE_IDS.length for now). */
    totalScenes: number;
}

export interface SceneRunnerControls {
    play(): void;
    pause(): void;
    toggle(): void;
    /** Jump to a specific scene by index. Clamps to [0, totalScenes - 1]. */
    setScene(index: number): void;
    /** Step to the next scene boundary (no advance if already at last). */
    nextScene(): void;
    /** Step to the previous scene boundary (no advance if already at first). */
    prevScene(): void;
    /** Set the normalized time within the current scene; clamps to [0, 1]. */
    setT(t: number): void;
    setSpeed(s: SceneSpeed): void;
}

export interface SceneRunnerOptions {
    /** Override per-scene durations. Defaults to 2000ms for unknown ids. */
    durations?: Partial<Record<SceneId, number>>;
    /** Start playing on mount. Defaults to false so tests don't tick. */
    autoplay?: boolean;
    /** Initial speed. Defaults to 1×. */
    initialSpeed?: SceneSpeed;
}

const DEFAULT_DURATION_MS = 2000;

export function useSceneRunner(options: SceneRunnerOptions = {}): {
    state: SceneRunnerState;
    controls: SceneRunnerControls;
} {
    const { durations, autoplay = false, initialSpeed = 1 } = options;

    const [sceneIndex, setSceneIndex] = useState(0);
    const [t, setT] = useState(0);
    const [playing, setPlaying] = useState(autoplay);
    const [speed, setSpeed] = useState<SceneSpeed>(initialSpeed);

    // Stable refs so the RAF loop closure stays correct across renders.
    const playingRef = useRef(playing);
    const speedRef = useRef(speed);
    const sceneIndexRef = useRef(sceneIndex);
    const tRef = useRef(t);

    useEffect(() => {
        playingRef.current = playing;
    }, [playing]);
    useEffect(() => {
        speedRef.current = speed;
    }, [speed]);
    useEffect(() => {
        sceneIndexRef.current = sceneIndex;
    }, [sceneIndex]);
    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const durationFor = useCallback(
        (id: SceneId): number => durations?.[id] ?? DEFAULT_DURATION_MS,
        [durations],
    );

    // RAF loop. Only mounts once; advances state via refs to stay
    // out of React's render cycle for the per-frame work.
    useEffect(() => {
        let raf = 0;
        let lastMs = performance.now();
        const tick = (nowMs: number) => {
            const dt = nowMs - lastMs;
            lastMs = nowMs;
            if (playingRef.current) {
                const currentId = SCENE_IDS[sceneIndexRef.current];
                const dur = durationFor(currentId);
                const advance = (dt * speedRef.current) / dur;
                const next = tRef.current + advance;
                if (next >= 1) {
                    const nextIndex = sceneIndexRef.current + 1;
                    if (nextIndex >= SCENE_IDS.length) {
                        // Reached the end. Pin at 1 + pause so the
                        // final scene's last frame stays on screen.

                        setT(1);

                        setPlaying(false);
                    } else {
                        setSceneIndex(nextIndex);

                        setT(0);
                    }
                } else {
                    setT(next);
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [durationFor]);

    const controls = useMemo<SceneRunnerControls>(
        () => ({
            play: () => setPlaying(true),
            pause: () => setPlaying(false),
            toggle: () => setPlaying((p) => !p),
            setScene: (index: number) => {
                const clamped = Math.max(0, Math.min(SCENE_IDS.length - 1, index));
                setSceneIndex(clamped);
                setT(0);
            },
            nextScene: () => {
                setSceneIndex((i) => Math.min(SCENE_IDS.length - 1, i + 1));
                setT(0);
            },
            prevScene: () => {
                setSceneIndex((i) => Math.max(0, i - 1));
                setT(0);
            },
            setT: (newT: number) => {
                setT(Math.max(0, Math.min(1, newT)));
            },
            setSpeed: (s: SceneSpeed) => setSpeed(s),
        }),
        [],
    );

    const state = useMemo<SceneRunnerState>(
        () => ({
            sceneIndex,
            sceneId: SCENE_IDS[sceneIndex],
            t,
            playing,
            speed,
            totalScenes: SCENE_IDS.length,
        }),
        [sceneIndex, t, playing, speed],
    );

    return { state, controls };
}
