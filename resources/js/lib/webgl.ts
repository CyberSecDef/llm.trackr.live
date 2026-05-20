/*
 * WebGL 2.0 capability probe (M12 chunk 8).
 *
 * The M8 viz scenes (VizPane + EmbeddingScene) need a WebGL 2.0
 * context. Older browsers, headless/server contexts, and machines
 * with broken GPU drivers will fail to create one — we detect that
 * up-front and fall through to the existing 2D Debug tab instead
 * of letting Three.js throw inside a React.lazy boundary.
 *
 * Strategy: create a throwaway canvas, ask for a 'webgl2' context,
 * return the boolean. The probe runs once per page-load and the
 * result is cached — `getContext` is cheap but not free, and the
 * hook below queries this many times during a render cycle.
 *
 * Why probe instead of trusting feature flags / user-agent sniffing:
 *   - User-agent strings lie (chromium-based browsers spoof Safari,
 *     embedded WebViews report Chrome, etc.).
 *   - A browser that *can* support WebGL 2 can still fail at
 *     runtime if the GPU driver is blocklisted (Linux/Mesa edge
 *     cases) or if the user disabled hardware accel in settings.
 *   - The probe answers "can this user actually mount a WebGL 2
 *     context right now?" — the only question we care about.
 */

let cached: boolean | null = null;

export function isWebGL2Supported(): boolean {
    if (cached !== null) return cached;
    if (typeof document === 'undefined') {
        // SSR / non-DOM context. We can't probe; assume unsupported
        // so the page server-renders the safe fallback. The client
        // hook re-probes after mount and corrects upward.
        return false;
    }
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('webgl2');
        cached = ctx !== null;
        return cached;
    } catch {
        // getContext can throw in some sandboxed environments.
        cached = false;
        return false;
    }
}

/**
 * Reset the cache. Test-only — production code should never need
 * this since GPU capability is fixed for the page lifetime.
 */
export function _resetWebGL2Cache(): void {
    cached = null;
}
