import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/*
 * VectorInspectionContext (M13 chunk 11b) — opt-in click-to-inspect
 * for any `VectorStrip`. Wrap a region in `<VectorInspectionProvider>`
 * and every `<VectorStrip>` inside becomes clickable; clicking opens
 * the docked `<NumericalValuesPanel>` with the strip's values.
 *
 * Per `phase1.md:1036` (spec literal): "Click any vector strip to
 * expand it into a numerical-values panel … the expanded panel
 * docks to the side, doesn't block the canvas."
 *
 * Why a context, not per-scene props:
 *   - 20 scenes × 4-8 strips each = ~100 strip mounts. Threading a
 *     click handler through every scene's render() is invasive.
 *   - Context is opt-in: VectorStrip uses `useContext(VectorInspectionContext)`
 *     which returns `null` when no provider wraps it. Scenes outside
 *     a provider stay clickable-as-before (i.e., non-clickable).
 *   - Provider state is just `active: ActiveInspection | null` plus
 *     `open(values, label)` / `close()`. Trivial.
 */

export interface ActiveInspection {
    values: readonly number[];
    label: string | null;
}

export interface VectorInspectionContextValue {
    active: ActiveInspection | null;
    open: (values: readonly number[], label?: string) => void;
    close: () => void;
}

const VectorInspectionContext = createContext<VectorInspectionContextValue | null>(null);

export function VectorInspectionProvider({ children }: { children: ReactNode }) {
    const [active, setActive] = useState<ActiveInspection | null>(null);

    // Stable open/close so callers can depend on them in useEffect
    // without re-firing on every active-change. The active-change
    // happens through setActive — passing a ref-stable function
    // avoids the chunk-11b infinite-loop where a caller's effect
    // observes the inspection object, calls open(), which sets
    // active, which recreates the inspection object, which retriggers
    // the effect, etc.
    const open = useCallback((values: readonly number[], label?: string) => {
        setActive({ values, label: label ?? null });
    }, []);

    const close = useCallback(() => setActive(null), []);

    const value = useMemo<VectorInspectionContextValue>(
        () => ({ active, open, close }),
        [active, open, close],
    );

    return (
        <VectorInspectionContext.Provider value={value}>
            {children}
        </VectorInspectionContext.Provider>
    );
}

/** Read the inspection context. Returns null when no provider
 *  wraps the caller — used by VectorStrip to opt out gracefully. */
export function useVectorInspection(): VectorInspectionContextValue | null {
    return useContext(VectorInspectionContext);
}
