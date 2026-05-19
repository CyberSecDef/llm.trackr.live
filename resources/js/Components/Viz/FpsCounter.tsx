import { useEffect, useRef, useState } from 'react';

/**
 * FpsCounter (M8 chunk 1) — dev-only overlay showing the viz's
 * frame rate. Rendered absolute-positioned by VizPane.
 *
 * Updates ~4× per second from a rolling 30-frame window so the
 * number doesn't twitch on every frame. Hidden in production
 * builds via `import.meta.env.DEV`.
 */

export default function FpsCounter() {
    const [fps, setFps] = useState(0);
    const frameTimesRef = useRef<number[]>([]);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!import.meta.env.DEV) return;

        let lastUpdate = performance.now();
        const tick = (now: number) => {
            const times = frameTimesRef.current;
            times.push(now);
            // Keep only the last 30 frames for the rolling average.
            if (times.length > 30) times.shift();

            // Update the displayed value at most every 250ms.
            if (now - lastUpdate > 250 && times.length > 1) {
                const span = times[times.length - 1] - times[0];
                setFps(Math.round((times.length - 1) / (span / 1000)));
                lastUpdate = now;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    if (!import.meta.env.DEV) return null;

    return (
        <div
            className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
            data-testid="fps-counter"
            aria-hidden="true"
        >
            {fps} fps
        </div>
    );
}
