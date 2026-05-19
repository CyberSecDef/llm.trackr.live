import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunStream } from '@/hooks/useRunStream';

/*
 * Vitest unit test for useRunStream (M6 chunk 4b).
 *
 * Echo + the WebSocket transport are mocked out — what we're verifying
 * is the hook's contract: subscribes on mount, registers a listener for
 * each known event name, accumulates events in order, flips status on
 * terminal events, and tears down cleanly on unmount.
 *
 * The mock channel exposes a `trigger(name, payload)` helper so each
 * test can drive the listener flow without needing a real connection.
 */

interface FakeChannel {
    listen: ReturnType<typeof vi.fn>;
    stopListening: ReturnType<typeof vi.fn>;
    trigger: (name: string, payload: unknown) => void;
}

function fakeChannel(): FakeChannel {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers: Record<string, (payload: any) => void> = {};
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listen: vi.fn((name: string, cb: (payload: any) => void) => {
            handlers[name] = cb;
        }),
        stopListening: vi.fn((name: string) => {
            delete handlers[name];
        }),
        trigger(name, payload) {
            handlers[name]?.(payload);
        },
    };
}

beforeEach(() => {
    // Echo's public surface is small — `.private(channelName)` returns
    // something with `.listen()` and `.stopListening()`, plus `.leave()`
    // on the Echo instance itself.
    const channel = fakeChannel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Echo = {
        private: vi.fn(() => channel),
        leave: vi.fn(),
        __channel: channel,
    };
});

afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Echo = null;
});

describe('useRunStream', () => {
    it('starts in idle status with no events', () => {
        const { result } = renderHook(() => useRunStream(42));
        expect(result.current.status).toBe('idle');
        expect(result.current.events).toEqual([]);
        expect(result.current.disabled).toBe(false);
    });

    it('subscribes to the runs.{id} private channel on mount', () => {
        renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((window as any).Echo.private).toHaveBeenCalledWith('runs.42');
    });

    it('registers a listener for every known event name', () => {
        renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;
        const registered = channel.listen.mock.calls.map((c: [string]) => c[0]);
        expect(registered).toEqual([
            '.run.started',
            '.token.received',
            '.layer.advanced',
            '.moe.routed',
            '.run.completed',
            '.run.errored',
        ]);
    });

    it('accumulates events in arrival order', () => {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => {
            channel.trigger('.run.started', {
                run_id: 42,
                thread_id: 1,
                model_id: 1,
                started_at: '2026-05-18T00:00:00Z',
            });
            channel.trigger('.token.received', {
                run_id: 42,
                token: 'Hi',
                index: 0,
                t_ms: 10,
                logprobs: null,
                is_final: false,
            });
            channel.trigger('.token.received', {
                run_id: 42,
                token: ' world',
                index: 1,
                t_ms: 30,
                logprobs: null,
                is_final: false,
            });
        });

        expect(result.current.events).toHaveLength(3);
        expect(result.current.events[0].event).toBe('run.started');
        expect(result.current.events[1].event).toBe('token.received');
        expect(result.current.events[2].event).toBe('token.received');
    });

    it('flips status to streaming on run.started', () => {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => channel.trigger('.run.started', { run_id: 42 }));
        expect(result.current.status).toBe('streaming');
    });

    it('flips status to complete on run.completed', () => {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => {
            channel.trigger('.run.started', { run_id: 42 });
            channel.trigger('.run.completed', { run_id: 42 });
        });
        expect(result.current.status).toBe('complete');
    });

    it('flips status to errored on run.errored', () => {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => {
            channel.trigger('.run.started', { run_id: 42 });
            channel.trigger('.run.errored', { run_id: 42, message: 'oops' });
        });
        expect(result.current.status).toBe('errored');
    });

    it('stops listening + leaves the channel on unmount', () => {
        const { unmount } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const echo = (window as any).Echo;
        unmount();

        expect(echo.__channel.stopListening).toHaveBeenCalled();
        expect(echo.leave).toHaveBeenCalledWith('runs.42');
    });

    it('does nothing when runId is null', () => {
        renderHook(() => useRunStream(null));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((window as any).Echo.private).not.toHaveBeenCalled();
    });

    it('resets state when runId changes', () => {
        const { result, rerender } = renderHook(
            ({ id }: { id: number | null }) => useRunStream(id),
            {
                initialProps: { id: 42 as number | null },
            },
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => channel.trigger('.run.started', { run_id: 42 }));
        expect(result.current.events).toHaveLength(1);

        rerender({ id: 99 });
        expect(result.current.events).toHaveLength(0);
        expect(result.current.status).toBe('idle');
    });

    it('reports disabled=true when Echo is null', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Echo = null;
        const { result } = renderHook(() => useRunStream(42));
        expect(result.current.disabled).toBe(true);
        expect(result.current.events).toEqual([]);
    });
});
