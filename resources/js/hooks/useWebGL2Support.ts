import { useEffect, useState } from 'react';
import { isWebGL2Supported } from '@/lib/webgl';

/**
 * useWebGL2Support (M12 chunk 8) — true when the runtime can mount
 * a WebGL 2.0 context, false otherwise.
 *
 * SSR-safe: returns `true` on initial render so the Three.js
 * components stay in the React tree during hydration. The mount
 * effect re-probes against the real DOM and corrects downward if
 * the runtime can't actually back the context.
 *
 * Why `true` instead of `false` for the initial state: matches the
 * common case (most users have WebGL 2). A `false` initial would
 * mount the fallback first and then yank the user back to the
 * Three.js tab after hydration — a much worse experience than the
 * other direction. The `useReducedMotion` hook makes the opposite
 * call because reduced-motion users are a minority preference; here
 * we're optimizing for the supported-runtime majority.
 *
 * No subscription: GPU capability doesn't change during a page
 * lifetime (the user can't toggle "enable WebGL" without reloading).
 * We probe once on mount and that's it.
 */
export function useWebGL2Support(): boolean {
    const [supported, setSupported] = useState<boolean>(true);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSupported(isWebGL2Supported());
    }, []);

    return supported;
}
