import { useEffect, useState } from 'react';
import { RUN_EVENT_NAMES, type RunEvent } from '@/types/runs';

/*
 * Subscribes to a run's event stream and accumulates events (M6
 * chunks 4b + 5b). Prefers the WebSocket transport (Laravel Echo /
 * Reverb / pusher-js) when available; on connection failure, falls
 * back to the SSE endpoint (`GET /runs/{id}/stream`).
 *
 * Transport selection:
 *   - `window.Echo` set + connected → WebSocket
 *   - `window.Echo` null OR pusher connection enters `failed` /
 *     `unavailable` → fall back to SSE
 *   - Neither available (e.g. SSR, EventSource missing) → 'none'
 *
 * Once we fall back to SSE we STAY there for the rest of the run,
 * even if WebSocket recovers. Avoids transport thrashing and the
 * dedup complexity that switching back would require. The next run
 * (new runId) starts fresh on WebSocket again. Documented choice;
 * see docs/phase1.md M6 chunk 5b.
 *
 * Mid-stream fallback resets `events` to []. The SSE controller
 * replays from the persisted token_log cursor 0, so the user sees
 * the run from the start (with a brief flicker). Simpler than
 * tracking a cursor; M8 can refine if the viz needs smoother UX.
 *
 * Two-effect shape: the first effect resets state when (runId,
 * transport) changes; the second sets up the subscription against
 * the active transport. Splitting them lets state reset reliably
 * fire BEFORE subscription begins, regardless of React's effect
 * scheduling.
 */

export type RunStreamStatus = 'idle' | 'streaming' | 'complete' | 'errored';
export type RunStreamTransport = 'websocket' | 'sse' | 'none';

export interface UseRunStreamResult {
    events: RunEvent[];
    status: RunStreamStatus;
    transport: RunStreamTransport;
    /** Back-compat alias for `transport === 'none'`. */
    disabled: boolean;
}

function pickInitialTransport(): RunStreamTransport {
    if (typeof window === 'undefined') {
        return 'none';
    }
    if (window.Echo) {
        return 'websocket';
    }
    if (typeof window.EventSource !== 'undefined') {
        return 'sse';
    }
    return 'none';
}

/**
 * Derive the next status from an event name. Pulled out so both
 * transports use the same transition table.
 */
function deriveStatus(name: RunEvent['event'], prev: RunStreamStatus): RunStreamStatus {
    if (name === 'run.started') return 'streaming';
    if (name === 'run.completed') return 'complete';
    if (name === 'run.errored') return 'errored';
    return prev;
}

export function useRunStream(runId: number | null): UseRunStreamResult {
    const [events, setEvents] = useState<RunEvent[]>([]);
    const [status, setStatus] = useState<RunStreamStatus>('idle');
    const [transport, setTransport] = useState<RunStreamTransport>(pickInitialTransport);

    // Effect 1: when (runId, transport) changes, reset state. Effect 2
    // does the subscription. Effects fire in declaration order, so the
    // reset always lands before the new transport's first event.
    //
    // Including `transport` in the deps is what makes the mid-stream
    // fallback work: when Effect 2 flips transport from 'websocket' to
    // 'sse', this effect re-runs and clears the event list so SSE can
    // replay from cursor 0 without leaving stale WS events behind.
    useEffect(() => {
        if (runId === null) {
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEvents([]);
        setStatus('idle');
    }, [runId, transport]);

    // Effect 2: subscribe against the active transport.
    useEffect(() => {
        if (runId === null || transport === 'none') {
            return;
        }

        const appendEvent = (name: RunEvent['event'], payload: RunEvent['payload']) => {
            setEvents((prev) => [...prev, { event: name, payload } as RunEvent]);
            setStatus((prev) => deriveStatus(name, prev));
        };

        if (transport === 'websocket') {
            const echo = window.Echo;
            if (!echo) {
                // Echo got torn down between renders. Fall back.
                // setTransport-in-effect is the documented pattern here:
                // it's how the fallback decision propagates to the next
                // render of this same effect.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setTransport(typeof window.EventSource !== 'undefined' ? 'sse' : 'none');
                return;
            }

            const channel = echo.private(`runs.${runId}`);
            for (const name of RUN_EVENT_NAMES) {
                channel.listen(`.${name}`, (payload: RunEvent['payload']) => {
                    appendEvent(name, payload);
                });
            }

            // Pusher's connection state changes drive the fallback
            // decision. 'failed' = handshake gave up; 'unavailable' =
            // disconnected and can't reconnect. Either way, SSE.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const connection = (echo as any).connector?.pusher?.connection;
            const onStateChange = (state: { current: string }) => {
                if (state.current === 'failed' || state.current === 'unavailable') {
                    setTransport(typeof window.EventSource !== 'undefined' ? 'sse' : 'none');
                }
            };
            connection?.bind?.('state_change', onStateChange);

            return () => {
                connection?.unbind?.('state_change', onStateChange);
                for (const name of RUN_EVENT_NAMES) {
                    channel.stopListening(`.${name}`);
                }
                echo.leave(`runs.${runId}`);
            };
        }

        // transport === 'sse'
        if (typeof window.EventSource === 'undefined') {
            setTransport('none');
            return;
        }
        const es = new EventSource(`/runs/${runId}/stream`);
        for (const name of RUN_EVENT_NAMES) {
            es.addEventListener(name, (e) => {
                const payload = JSON.parse((e as MessageEvent).data);
                appendEvent(name, payload);
            });
        }
        // SSE has no nuanced state machine — if onerror fires after
        // readyState=CLOSED, the connection's dead. Browser auto-
        // reconnect handles transient drops; we only intervene for
        // hard close.
        es.onerror = () => {
            if (es.readyState === EventSource.CLOSED) {
                setTransport('none');
            }
        };

        return () => {
            es.close();
        };
    }, [runId, transport]);

    return {
        events,
        status,
        transport,
        disabled: transport === 'none',
    };
}
