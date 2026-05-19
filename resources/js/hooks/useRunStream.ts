import { useEffect, useState } from 'react';
import { RUN_EVENT_NAMES, type RunEvent } from '@/types/runs';

/*
 * Subscribes to `private-runs.{runId}` and accumulates every event the
 * StreamRunJob broadcasts (M6 chunk 4b).
 *
 * Echo is read from `window.Echo` (initialized in resources/js/echo.ts).
 * If Echo isn't configured for the current environment (no
 * VITE_REVERB_APP_KEY set), the hook becomes a no-op — `events` stays
 * empty and `status` stays `idle`. That keeps the debug page renderable
 * in CI / preview environments without a Reverb server.
 *
 * Cleanup: on unmount or runId change we stop listening for every event
 * name and leave the channel. Without that, page navigation would leak
 * subscriptions across runs.
 *
 * The status transitions are derived from terminal events:
 *   - `run.started` flips idle → streaming
 *   - `run.completed` flips streaming → complete
 *   - `run.errored` flips streaming → errored
 * Components can render different shells based on this without
 * re-walking the event list.
 */

export type RunStreamStatus = 'idle' | 'streaming' | 'complete' | 'errored';

export interface UseRunStreamResult {
    events: RunEvent[];
    status: RunStreamStatus;
    /** True when Echo isn't configured — the page will never receive events. */
    disabled: boolean;
}

export function useRunStream(runId: number | null): UseRunStreamResult {
    const [events, setEvents] = useState<RunEvent[]>([]);
    const [status, setStatus] = useState<RunStreamStatus>('idle');
    const disabled = typeof window === 'undefined' || window.Echo === null;

    useEffect(() => {
        if (runId === null || disabled) {
            return;
        }
        // Capture Echo into the closure so cleanup uses the same instance
        // we subscribed against — guards against the global being torn
        // down (test teardown, hot reload) before unmount runs.
        const echo = window.Echo;
        if (!echo) {
            return;
        }

        // Reset state when switching to a different run. The lint rule
        // warns about cascading renders, but the alternative (deriving
        // from props via a key) requires the parent to re-mount us —
        // a worse contract for callers. The reset only fires when
        // runId itself changes, so the "cascading renders" risk is one
        // extra render at a transition the user is already triggering.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEvents([]);

        setStatus('idle');

        const channel = echo.private(`runs.${runId}`);

        for (const name of RUN_EVENT_NAMES) {
            channel.listen(`.${name}`, (payload: RunEvent['payload']) => {
                setEvents((prev) => [...prev, { event: name, payload } as RunEvent]);

                if (name === 'run.started') {
                    setStatus('streaming');
                } else if (name === 'run.completed') {
                    setStatus('complete');
                } else if (name === 'run.errored') {
                    setStatus('errored');
                }
            });
        }

        return () => {
            for (const name of RUN_EVENT_NAMES) {
                channel.stopListening(`.${name}`);
            }
            echo.leave(`runs.${runId}`);
        };
    }, [runId, disabled]);

    return { events, status, disabled };
}
