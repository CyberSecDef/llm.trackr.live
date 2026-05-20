import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * useExportTrigger (M10 chunk 5b) — drives the GIF/MP4 chooser
 * flow from the Download dropdown.
 *
 * Flow:
 *   1. User clicks "Export GIF" or "Export MP4" in the menu.
 *   2. Hook POSTs to /runs/{id}/export.
 *      - 200 with `ready: true`: cache hit, URLs returned in body.
 *        State flips to 'ready' immediately; user clicks the
 *        download link.
 *      - 202 with `ready: false`: render queued. State flips to
 *        'rendering'.
 *   3. While 'rendering', the hook subscribes to the run's
 *      private channel and waits for the broadcast event
 *      `export.completed` (chunk-5a). On receipt, state flips to
 *      'ready'; on `export.failed`, state flips to 'error'.
 *
 * Per chunk-5 decision: cache-hit path goes straight to 'ready'
 * (no flicker), and the WebSocket completion signal beats polling.
 *
 * Subscription teardown is critical: the hook is mounted inside
 * the dropdown which can close at any time. The Echo cleanup
 * function fires on unmount + on every runId change.
 */

export type ExportTriggerState = 'idle' | 'rendering' | 'ready' | 'error';

export interface ExportTriggerResult {
    state: ExportTriggerState;
    gifUrl: string | null;
    mp4Url: string | null;
    error: string | null;
    trigger(): Promise<void>;
    reset(): void;
}

interface ExportCompletedPayload {
    run_id: number;
    gif_url: string;
    mp4_url: string;
    frames_count: number;
    duration_ms: number;
}

interface ExportFailedPayload {
    run_id: number;
    message: string;
}

interface TriggerOkResponse {
    ready: boolean;
    gif_url?: string;
    mp4_url?: string;
    status?: string;
}

export function useExportTrigger(runId: number | null): ExportTriggerResult {
    const [state, setState] = useState<ExportTriggerState>('idle');
    const [gifUrl, setGifUrl] = useState<string | null>(null);
    const [mp4Url, setMp4Url] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Track active subscription so we can tear it down on unmount /
    // runId change. The hook is mounted by an always-rendered
    // dropdown trigger, so the cleanup is the only thing keeping
    // Echo from leaking channels.
    const channelNameRef = useRef<string | null>(null);

    const teardown = useCallback(() => {
        const echo = typeof window !== 'undefined' ? window.Echo : undefined;
        if (!echo || !channelNameRef.current) return;
        echo.leave(channelNameRef.current);
        channelNameRef.current = null;
    }, []);

    useEffect(() => {
        return () => teardown();
    }, [teardown]);

    const reset = useCallback(() => {
        teardown();
        setState('idle');
        setGifUrl(null);
        setMp4Url(null);
        setError(null);
    }, [teardown]);

    const subscribe = useCallback(
        (id: number) => {
            const echo = typeof window !== 'undefined' ? window.Echo : undefined;
            if (!echo) return; // no WebSocket → caller can refresh later
            const channelName = `runs.${id}`;
            channelNameRef.current = channelName;
            const channel = echo.private(channelName);
            channel.listen('.export.completed', (payload: ExportCompletedPayload) => {
                if (payload.run_id !== id) return;
                setGifUrl(payload.gif_url);
                setMp4Url(payload.mp4_url);
                setState('ready');
                teardown();
            });
            channel.listen('.export.failed', (payload: ExportFailedPayload) => {
                if (payload.run_id !== id) return;
                setError(payload.message);
                setState('error');
                teardown();
            });
        },
        [teardown],
    );

    const trigger = useCallback(async () => {
        if (runId === null) return;
        teardown();
        setState('rendering');
        setError(null);

        const csrf =
            document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';

        let response: Response;
        try {
            response = await fetch(`/runs/${runId}/export`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrf,
                },
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Network error');
            setState('error');
            return;
        }

        if (!response.ok && response.status !== 202) {
            setError(`Export request failed (HTTP ${response.status})`);
            setState('error');
            return;
        }

        const data = (await response.json().catch(() => null)) as TriggerOkResponse | null;
        if (data === null) {
            setError('Invalid response from export endpoint');
            setState('error');
            return;
        }

        if (data.ready && data.gif_url && data.mp4_url) {
            setGifUrl(data.gif_url);
            setMp4Url(data.mp4_url);
            setState('ready');
            return;
        }

        // Cache miss: subscribe + wait for broadcast.
        subscribe(runId);
    }, [runId, subscribe, teardown]);

    return { state, gifUrl, mp4Url, error, trigger, reset };
}
