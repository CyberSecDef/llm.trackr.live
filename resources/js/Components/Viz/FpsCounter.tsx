import { useSyncExternalStore } from 'react';
import { usePerformanceMode } from '@/Components/Viz/PerformanceModeContext';

/*
 * FpsCounter (M8 chunk 4 + M13 chunk 12) — small overlay showing
 * the viz's frame rate and the degraded-mode flag.
 *
 * Chunk-12 changes:
 *   - Reads FPS + degraded from `usePerformanceMode()`, not from its
 *     own RAF loop. The state machine lives in `useFpsTracker`
 *     (mounted by CinematicViz); this component is a pure display.
 *   - Visible when EITHER `import.meta.env.DEV` is true OR the URL
 *     has `?debug=fps`. Production users don't see it by default;
 *     the query-param exposes it for on-prod perf checks without
 *     baking debug UI into shipped pages.
 *   - Adds a "(degraded)" suffix when the degraded flag is true.
 *     Helps spot the state machine flipping during testing.
 */

function getSnapshot(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return new URLSearchParams(window.location.search).get('debug') === 'fps';
    } catch {
        return false;
    }
}

function getServerSnapshot(): boolean {
    return false; // SSR has no URL params from window.location
}

function subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    // popstate fires on history nav; not perfect (query-only changes
    // don't fire it) but the URL is set at page load in this app so
    // the snapshot lookup at mount is what matters.
    window.addEventListener('popstate', callback);
    return () => window.removeEventListener('popstate', callback);
}

export default function FpsCounter() {
    const { fps, degraded } = usePerformanceMode();
    const debugQuery = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const visible = import.meta.env.DEV || debugQuery;
    if (!visible) return null;

    return (
        <div
            className={`absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] ${
                degraded ? 'text-amber-300' : 'text-emerald-300'
            }`}
            data-testid="fps-counter"
            data-degraded={degraded ? 'true' : 'false'}
            aria-hidden="true"
        >
            {fps} fps{degraded ? ' (degraded)' : ''}
        </div>
    );
}
