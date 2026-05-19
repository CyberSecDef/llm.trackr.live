import { useEffect, useState } from 'react';

/**
 * useReducedMotion — true when the OS-level `prefers-reduced-motion`
 * media query is set. Used by the M8 viz to swap the animated
 * Three.js scene for a stepped/static fallback per SPEC §11.
 *
 * Subscribes to media-query changes so a user toggling the setting
 * mid-session sees the UI react without a reload.
 *
 * SSR-safe: returns `false` when `window` isn't defined (e.g. during
 * Inertia's initial render on the server) — the client effect
 * corrects it on hydrate.
 */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    return reduced;
}
