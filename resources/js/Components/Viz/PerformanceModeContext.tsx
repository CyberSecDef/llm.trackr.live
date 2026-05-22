import { createContext, useContext, type ReactNode } from 'react';

/*
 * PerformanceModeContext (M13 chunk 12) — read-only context that
 * exposes the FPS + degraded-mode state to viz consumers
 * (VectorStrip, ParticleTrail, AttentionScene, FpsCounter).
 *
 * Mounted by `CinematicViz` with values from `useFpsTracker`. The
 * provider is intentionally thin — no internal state, no actions.
 * The state machine lives in the hook; the context only flows it
 * down to consumers via `usePerformanceMode()`.
 *
 * Why context not props:
 *   - VectorStrip is rendered by ~13 scenes; threading a
 *     `degraded` prop through each scene would be invasive.
 *   - Same pattern as `VectorInspectionContext` (chunk 11b).
 *   - Components outside a provider get the safe default
 *     `{ fps: 0, degraded: false }` — i.e., full-quality render.
 */

export interface PerformanceModeValue {
    fps: number;
    degraded: boolean;
}

const DEFAULT_VALUE: PerformanceModeValue = { fps: 0, degraded: false };

const PerformanceModeContext = createContext<PerformanceModeValue>(DEFAULT_VALUE);

export interface PerformanceModeProviderProps {
    value: PerformanceModeValue;
    children: ReactNode;
}

export function PerformanceModeProvider({ value, children }: PerformanceModeProviderProps) {
    return (
        <PerformanceModeContext.Provider value={value}>{children}</PerformanceModeContext.Provider>
    );
}

/** Read the current performance state. Returns the safe default
 *  `{ fps: 0, degraded: false }` when no provider wraps the caller. */
export function usePerformanceMode(): PerformanceModeValue {
    return useContext(PerformanceModeContext);
}
