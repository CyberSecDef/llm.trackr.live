import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCENE_IDS, type PipelineState, type Scene, type SceneId } from '@/Components/Viz/Scene';

/*
 * useSceneRunner (M13 chunk 1; extended in chunk 3a) — state machine
 * that walks the 21 scenes from `docs/visualization.md`.
 *
 * Chunk 3a adds:
 *   - A `scenes` registry: an array of `Scene<PipelineState, PipelineState>`
 *     definitions. Chunks 3-9 register scenes; the runner walks them
 *     in order, threading the previous scene's transform output into
 *     the next scene's input.
 *   - `initialState`: the PipelineState that seeds scene 0. When the
 *     user submits a prompt, the parent passes `{promptText}` as
 *     `initialState` and the runner re-initializes the pipeline.
 *   - The returned state now exposes `pipelineState` (the resolved
 *     input to the current scene) + `currentScene` (the Scene
 *     definition at sceneIndex, or undefined if scenes registry is
 *     shorter than SCENE_IDS).
 *
 * Why a hook, not a Context or class instance:
 *   - Matches the existing M8 pattern (useEventPlayback, useRunStream).
 *   - Tests stay pure-React (renderHook from @testing-library/react).
 *   - Per-mount hook instances stay cheap.
 *
 * Pipeline-state caching: `pipelineInputs[i]` is the PipelineState
 * passed to scene i's render. When the user jumps to scene N via
 * `setScene(N)`, we walk forward from `pipelineInputs[0]` applying
 * registered transforms to derive `pipelineInputs[1..N]`. Cached
 * across renders; rebuilt only when `initialState` or `scenes`
 * reference changes.
 */

export const PLAYBACK_SPEEDS = [0.25, 1, 4] as const;
export type SceneSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface SceneRunnerState {
    sceneIndex: number;
    sceneId: SceneId;
    t: number;
    playing: boolean;
    speed: SceneSpeed;
    totalScenes: number;
    /** PipelineState resolved as the input to scene[sceneIndex]. */
    pipelineState: PipelineState;
    /** The Scene definition at sceneIndex, or undefined when the
     *  registered scenes array is shorter than SCENE_IDS. */
    currentScene: Scene<PipelineState, PipelineState> | undefined;
}

export interface SceneRunnerControls {
    play(): void;
    pause(): void;
    toggle(): void;
    setScene(index: number): void;
    nextScene(): void;
    prevScene(): void;
    setT(t: number): void;
    setSpeed(s: SceneSpeed): void;
}

export interface SceneRunnerOptions {
    /** Scene registry, indexed by ordinal (Scene 0 .. Scene 20).
     *  Chunks 3-9 fill in entries as they land. Missing entries
     *  fall back to the placeholder duration + an undefined
     *  `currentScene`. */
    scenes?: ReadonlyArray<Scene<PipelineState, PipelineState>>;
    /** Initial pipeline state. Default {} (empty). When the parent
     *  re-renders with a new `initialState` reference, the cache
     *  resets to scene 0 + the new state. */
    initialState?: PipelineState;
    /** Override per-scene durations for unregistered scenes.
     *  Registered scenes use their own `durationMs`. */
    durations?: Partial<Record<SceneId, number>>;
    /** Start playing on mount. */
    autoplay?: boolean;
    initialSpeed?: SceneSpeed;
}

const DEFAULT_DURATION_MS = 2000;
const EMPTY_STATE: PipelineState = {};

export function useSceneRunner(options: SceneRunnerOptions = {}): {
    state: SceneRunnerState;
    controls: SceneRunnerControls;
} {
    const {
        scenes,
        initialState = EMPTY_STATE,
        durations,
        autoplay = false,
        initialSpeed = 1,
    } = options;

    const [sceneIndex, setSceneIndex] = useState(0);
    const [t, setT] = useState(0);
    const [playing, setPlaying] = useState(autoplay);
    const [speed, setSpeed] = useState<SceneSpeed>(initialSpeed);

    // Stable refs for the RAF loop.
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

    /**
     * Pipeline state cache: pipelineInputs[i] is the input to scene i.
     * Recomputed when `initialState` or the scenes-registry reference
     * changes (typically when the user submits a new prompt). Linear
     * walk through the registered scenes' `transform` functions.
     */
    const pipelineInputs = useMemo<PipelineState[]>(() => {
        const result: PipelineState[] = [initialState];
        const count = scenes?.length ?? 0;
        let current = initialState;
        for (let i = 0; i < count; i++) {
            current = scenes![i].transform(current);
            result.push(current);
        }
        return result;
    }, [scenes, initialState]);

    /** Reset to scene 0 when the pipeline reseeds (new prompt or
     *  new scene registry). setState-in-effect is correct here: we
     *  ARE syncing local state with an external input (the parent
     *  re-rendered with a new initialState reference). */
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSceneIndex(0);

        setT(0);
    }, [initialState, scenes]);

    /** Resolve per-scene duration: registered scene wins, else the
     *  options.durations override, else the default. */
    const durationFor = useCallback(
        (index: number): number => {
            const registered = scenes?.[index];
            if (registered) return registered.durationMs;
            const id = SCENE_IDS[index];
            return durations?.[id] ?? DEFAULT_DURATION_MS;
        },
        [scenes, durations],
    );

    /** RAF loop. */
    useEffect(() => {
        let raf = 0;
        let lastMs = performance.now();
        const tick = (nowMs: number) => {
            const dt = nowMs - lastMs;
            lastMs = nowMs;
            if (playingRef.current) {
                const idx = sceneIndexRef.current;
                const dur = durationFor(idx);
                const advance = (dt * speedRef.current) / dur;
                const next = tRef.current + advance;
                if (next >= 1) {
                    const nextIndex = idx + 1;
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

    const state = useMemo<SceneRunnerState>(() => {
        const pipelineState = pipelineInputs[sceneIndex] ?? initialState;
        const currentScene = scenes?.[sceneIndex];
        return {
            sceneIndex,
            sceneId: SCENE_IDS[sceneIndex],
            t,
            playing,
            speed,
            totalScenes: SCENE_IDS.length,
            pipelineState,
            currentScene,
        };
    }, [sceneIndex, t, playing, speed, pipelineInputs, scenes, initialState]);

    return { state, controls };
}
