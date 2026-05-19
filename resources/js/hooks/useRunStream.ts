import { useEffect, useRef, useState } from 'react';
import { RUN_EVENT_NAMES, type RunEvent } from '@/types/runs';

/*
 * Subscribes to a run's event stream and accumulates events (M6
 * chunks 4b + 5b + 6). Prefers the WebSocket transport (Laravel Echo
 * / Reverb / pusher-js); on hard failure falls back to the SSE
 * endpoint; on transient WS disconnects backfills via a JSON
 * endpoint when pusher reconnects.
 *
 * Transport selection:
 *   - `window.Echo` set + connected → WebSocket
 *   - `window.Echo` null OR pusher connection enters `failed` /
 *     `unavailable` → fall back to SSE
 *   - Neither available (e.g. SSR, EventSource missing) → 'none'
 *
 * Reconnect/backfill (chunk 6): on the WebSocket path, the hook
 * tracks the highest token-index it has seen. When pusher transitions
 * from a disconnected state back to `connected`, it fetches
 * `GET /runs/{id}/events?since=N+1` and appends the slice as if it
 * arrived live. This catches the events broadcast during the gap
 * (pusher-js does not replay missed messages on reconnect).
 *
 * Hard failure → SSE fallback. Once we fall back to SSE we STAY there
 * for the rest of the run, even if WebSocket recovers. Avoids
 * transport thrashing and dedup complexity. The next run (new runId)
 * starts fresh on WebSocket again.
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

interface BackfillResponse {
    run_id: number;
    status: string;
    since: number;
    cursor: number;
    token_log: Array<{
        token: string;
        index: number;
        t_ms: number;
        logprobs: Array<{ token: string; logprob: number }> | null;
    }>;
    completion: {
        input_tokens: number;
        output_tokens: number;
        duration_ms: number;
        tokens_per_second: number;
        estimated_cost: number | null;
    } | null;
    error: {
        message: string;
        partial_output: string | null;
    } | null;
}

export function useRunStream(runId: number | null): UseRunStreamResult {
    const [events, setEvents] = useState<RunEvent[]>([]);
    const [status, setStatus] = useState<RunStreamStatus>('idle');
    const [transport, setTransport] = useState<RunStreamTransport>(pickInitialTransport);

    // Highest token.received index we've appended. Used as the cursor
    // for the WS-reconnect backfill so we only fetch the gap.
    const maxSeenIndex = useRef<number>(-1);
    // Tracks whether pusher has been in a disconnected-ish state
    // since the last 'connected'. Cleared after a successful
    // backfill (or skipped backfill on first connect).
    const wasDisconnected = useRef<boolean>(false);

    // Effect 1: when (runId, transport) changes, reset state. Effect 2
    // does the subscription. Effects fire in declaration order, so the
    // reset always lands before the new transport's first event.
    useEffect(() => {
        if (runId === null) {
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEvents([]);
        setStatus('idle');
        maxSeenIndex.current = -1;
        wasDisconnected.current = false;
    }, [runId, transport]);

    // Effect 2: subscribe against the active transport.
    useEffect(() => {
        if (runId === null || transport === 'none') {
            return;
        }

        const appendEvent = (name: RunEvent['event'], payload: RunEvent['payload']) => {
            setEvents((prev) => [...prev, { event: name, payload } as RunEvent]);
            setStatus((prev) => deriveStatus(name, prev));
            if (name === 'token.received') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const idx = (payload as any).index;
                if (typeof idx === 'number' && idx > maxSeenIndex.current) {
                    maxSeenIndex.current = idx;
                }
            }
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

            const runBackfill = async () => {
                const since = maxSeenIndex.current + 1;
                try {
                    const response = await fetch(`/runs/${runId}/events?since=${since}`, {
                        credentials: 'same-origin',
                        headers: { Accept: 'application/json' },
                    });
                    if (!response.ok) return;
                    const data = (await response.json()) as BackfillResponse;
                    for (const entry of data.token_log ?? []) {
                        appendEvent('token.received', {
                            run_id: runId,
                            token: entry.token,
                            index: entry.index,
                            t_ms: entry.t_ms,
                            logprobs: entry.logprobs ?? null,
                            is_final: false,
                        });
                    }
                    if (data.status === 'complete' && data.completion) {
                        appendEvent('run.completed', {
                            run_id: runId,
                            ...data.completion,
                        });
                    } else if (data.status === 'error' && data.error) {
                        appendEvent('run.errored', {
                            run_id: runId,
                            ...data.error,
                        });
                    }
                } catch {
                    // Network blip during backfill — next reconnect retries.
                }
            };

            // Pusher's connection state changes drive both the SSE
            // fallback (on hard failure) and the reconnect backfill
            // (on transient drop + recover).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const connection = (echo as any).connector?.pusher?.connection;
            const onStateChange = (state: { current: string; previous?: string }) => {
                if (state.current === 'failed' || state.current === 'unavailable') {
                    // Hard failure → SSE fallback path (chunk 5b).
                    setTransport(typeof window.EventSource !== 'undefined' ? 'sse' : 'none');

                    return;
                }
                if (state.current === 'disconnected' || state.current === 'connecting') {
                    wasDisconnected.current = true;
                }
                if (state.current === 'connected' && wasDisconnected.current) {
                    wasDisconnected.current = false;
                    void runBackfill();
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
