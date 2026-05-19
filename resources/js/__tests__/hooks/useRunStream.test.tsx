import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunStream } from '@/hooks/useRunStream';

/*
 * Vitest unit tests for useRunStream (M6 chunks 4b + 5b).
 *
 * Both transports are mocked out — what we're verifying is the hook's
 * contract: subscribes on mount via the preferred transport, falls
 * back to SSE on WebSocket failure, accumulates events, tears down
 * cleanly.
 *
 * The mock channel + mock EventSource each expose a `trigger(name,
 * payload)` helper so tests drive event flow without a real transport.
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

interface FakeConnection {
    bind: ReturnType<typeof vi.fn>;
    unbind: ReturnType<typeof vi.fn>;
    /** Fire a state_change to trigger fallback. */
    fire: (current: string) => void;
}

function fakeConnection(): FakeConnection {
    let stateHandler: ((s: { current: string }) => void) | null = null;
    return {
        bind: vi.fn((event: string, cb: (s: { current: string }) => void) => {
            if (event === 'state_change') stateHandler = cb;
        }),
        unbind: vi.fn(() => {
            stateHandler = null;
        }),
        fire(current) {
            stateHandler?.({ current });
        },
    };
}

interface FakeEventSourceInstance {
    url: string;
    addEventListener: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onerror: ((this: EventSource, ev: Event) => unknown) | null;
    readyState: number;
    trigger: (name: string, data: unknown) => void;
    triggerError: () => void;
}

interface FakeEventSource {
    /** The most recently constructed instance. */
    instance: FakeEventSourceInstance;
    /** Spy for the constructor itself; assert urls via .mock.calls. */
    ctor: ReturnType<typeof vi.fn<(url: string) => void>>;
}

function makeFakeEventSource(): FakeEventSource {
    const holder: FakeEventSource = {
        instance: null as unknown as FakeEventSourceInstance,
        ctor: vi.fn<(url: string) => void>(),
    };

    class FakeES {
        url: string;
        addEventListener: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
        readyState: number = 1; // OPEN
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private handlers: Record<string, (e: any) => void> = {};

        constructor(url: string) {
            this.url = url;
            this.addEventListener = vi.fn((name: string, cb: (e: MessageEvent) => void) => {
                this.handlers[name] = cb;
            });
            this.close = vi.fn(() => {
                this.readyState = 2; // CLOSED
            });
            holder.instance = this as unknown as FakeEventSourceInstance;
            holder.ctor(url);
        }

        trigger = (name: string, data: unknown) => {
            this.handlers[name]?.({ data: JSON.stringify(data) } as MessageEvent);
        };

        triggerError = () => {
            this.readyState = 2;
            this.onerror?.call(this as unknown as EventSource, new Event('error'));
        };
    }

    // Patch readyState constants onto the class so the hook's
    // EventSource.CLOSED check works.
    Object.assign(FakeES, { CLOSED: 2, OPEN: 1, CONNECTING: 0 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).EventSource = FakeES;
    return holder;
}

beforeEach(() => {
    const channel = fakeChannel();
    const connection = fakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Echo = {
        private: vi.fn(() => channel),
        leave: vi.fn(),
        connector: { pusher: { connection } },
        __channel: channel,
        __connection: connection,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__fakeES = makeFakeEventSource();
});

afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Echo = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).EventSource;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__fakeES;
});

describe('useRunStream — WebSocket transport (preferred)', function () {
    it('starts in idle status with transport=websocket when Echo is available', function () {
        const { result } = renderHook(() => useRunStream(42));
        expect(result.current.status).toBe('idle');
        expect(result.current.events).toEqual([]);
        expect(result.current.transport).toBe('websocket');
        expect(result.current.disabled).toBe(false);
    });

    it('subscribes to runs.{id} on mount and registers every event listener', function () {
        renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((window as any).Echo.private).toHaveBeenCalledWith('runs.42');
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

    it('accumulates events from the WebSocket in arrival order', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => {
            channel.trigger('.run.started', { run_id: 42 });
            channel.trigger('.token.received', { run_id: 42, token: 'Hi', index: 0 });
        });

        expect(result.current.events).toHaveLength(2);
        expect(result.current.events[0].event).toBe('run.started');
        expect(result.current.status).toBe('streaming');
    });

    it('flips status to complete on run.completed', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => {
            channel.trigger('.run.started', { run_id: 42 });
            channel.trigger('.run.completed', { run_id: 42 });
        });
        expect(result.current.status).toBe('complete');
    });

    it('flips status to errored on run.errored', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => channel.trigger('.run.errored', { run_id: 42, message: 'oops' }));
        expect(result.current.status).toBe('errored');
    });

    it('stops listening + leaves the channel on unmount', function () {
        const { unmount } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const echo = (window as any).Echo;
        unmount();

        expect(echo.__channel.stopListening).toHaveBeenCalled();
        expect(echo.leave).toHaveBeenCalledWith('runs.42');
    });

    it('does nothing when runId is null', function () {
        renderHook(() => useRunStream(null));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((window as any).Echo.private).not.toHaveBeenCalled();
    });
});

describe('useRunStream — SSE transport (Echo unavailable)', function () {
    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Echo = null;
    });

    it('falls back to SSE when Echo is null', function () {
        const { result } = renderHook(() => useRunStream(42));
        expect(result.current.transport).toBe('sse');
        expect(result.current.disabled).toBe(false);
    });

    it('opens an EventSource at /runs/{id}/stream', function () {
        renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const es = (window as any).__fakeES;
        expect(es.ctor).toHaveBeenCalledWith('/runs/42/stream');
    });

    it('registers an addEventListener for every event name', function () {
        renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const es = (window as any).__fakeES;
        const registered = es.instance.addEventListener.mock.calls.map((c: [string]) => c[0]);
        expect(registered).toEqual([
            'run.started',
            'token.received',
            'layer.advanced',
            'moe.routed',
            'run.completed',
            'run.errored',
        ]);
    });

    it('accumulates SSE events and updates status', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const es = (window as any).__fakeES.instance;

        act(() => {
            es.trigger('run.started', { run_id: 42 });
            es.trigger('token.received', { run_id: 42, token: 'a', index: 0 });
            es.trigger('run.completed', { run_id: 42 });
        });

        expect(result.current.events).toHaveLength(3);
        expect(result.current.status).toBe('complete');
    });

    it('closes the EventSource on unmount', function () {
        const { unmount } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const es = (window as any).__fakeES.instance;
        unmount();
        expect(es.close).toHaveBeenCalled();
    });

    it('flips to transport=none if the SSE connection hard-closes', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const es = (window as any).__fakeES.instance;

        act(() => es.triggerError());
        expect(result.current.transport).toBe('none');
        expect(result.current.disabled).toBe(true);
    });
});

describe('useRunStream — WS → SSE fallback', function () {
    it('switches to SSE when pusher connection enters failed state', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connection = (window as any).Echo.__connection;

        expect(result.current.transport).toBe('websocket');
        act(() => connection.fire('failed'));
        expect(result.current.transport).toBe('sse');
    });

    it('switches to SSE when pusher connection becomes unavailable', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connection = (window as any).Echo.__connection;

        act(() => connection.fire('unavailable'));
        expect(result.current.transport).toBe('sse');
    });

    it('does not switch transports on transient connecting/connected states', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connection = (window as any).Echo.__connection;

        act(() => {
            connection.fire('connecting');
            connection.fire('connected');
        });
        expect(result.current.transport).toBe('websocket');
    });

    it('resets events when falling back so SSE can replay from cursor 0', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const echo = (window as any).Echo;
        const connection = echo.__connection;

        act(() => {
            echo.__channel.trigger('.run.started', { run_id: 42 });
            echo.__channel.trigger('.token.received', { run_id: 42, token: 'A', index: 0 });
        });
        expect(result.current.events).toHaveLength(2);

        act(() => connection.fire('failed'));
        expect(result.current.events).toEqual([]);
        expect(result.current.status).toBe('idle');
        expect(result.current.transport).toBe('sse');
    });

    it('opens an EventSource after the WS fallback', function () {
        renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connection = (window as any).Echo.__connection;

        act(() => connection.fire('failed'));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((window as any).__fakeES.ctor).toHaveBeenCalledWith('/runs/42/stream');
    });

    it('stays on SSE even if WebSocket recovers later', function () {
        const { result } = renderHook(() => useRunStream(42));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connection = (window as any).Echo.__connection;

        act(() => connection.fire('failed'));
        expect(result.current.transport).toBe('sse');

        // Even if pusher reconnects, we don't transition back —
        // the SSE effect is the one that's listening now.
        act(() => connection.fire('connected'));
        expect(result.current.transport).toBe('sse');
    });
});

describe('useRunStream — no transport available', function () {
    it('reports transport=none + disabled=true when neither Echo nor EventSource exist', function () {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Echo = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).EventSource;

        const { result } = renderHook(() => useRunStream(42));
        expect(result.current.transport).toBe('none');
        expect(result.current.disabled).toBe(true);
        expect(result.current.events).toEqual([]);
    });
});

describe('useRunStream — runId changes', function () {
    it('resets state when runId changes', function () {
        const { result, rerender } = renderHook(
            ({ id }: { id: number | null }) => useRunStream(id),
            { initialProps: { id: 42 as number | null } },
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => channel.trigger('.run.started', { run_id: 42 }));
        expect(result.current.events).toHaveLength(1);

        rerender({ id: 99 });
        expect(result.current.events).toHaveLength(0);
        expect(result.current.status).toBe('idle');
    });
});
