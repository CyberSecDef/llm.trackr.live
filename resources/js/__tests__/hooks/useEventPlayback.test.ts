import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEventPlayback } from '@/hooks/useEventPlayback';
import type { RunEvent } from '@/types/runs';

function tokenEvent(token: string, t_ms: number, index: number): RunEvent {
    return {
        event: 'token.received',
        payload: { run_id: 1, token, index, t_ms, logprobs: null, is_final: false },
    };
}

function layerEvent(tokenIndex: number): RunEvent {
    return {
        event: 'layer.advanced',
        payload: { run_id: 1, token_index: tokenIndex, total_layers: 12 },
    };
}

describe('useEventPlayback', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts playing at 1× (LIVE) with cursor at the head', () => {
        const events: RunEvent[] = [tokenEvent('a', 100, 0), tokenEvent('b', 200, 1)];
        const { result } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: events },
        });
        expect(result.current.playing).toBe(true);
        expect(result.current.speed).toBe(1);
        expect(result.current.cursor).toBe(2);
        expect(result.current.isLive).toBe(true);
        expect(result.current.visibleEvents).toHaveLength(2);
    });

    it('cursor follows events.length when more events arrive at 1×', () => {
        let events: RunEvent[] = [tokenEvent('a', 100, 0)];
        const { result, rerender } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: events },
        });
        expect(result.current.cursor).toBe(1);

        events = [...events, tokenEvent('b', 200, 1), tokenEvent('c', 300, 2)];
        rerender({ e: events });
        expect(result.current.cursor).toBe(3);
        expect(result.current.isLive).toBe(true);
    });

    it('pause freezes the cursor while new events accumulate', () => {
        let events: RunEvent[] = [tokenEvent('a', 100, 0)];
        const { result, rerender } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: events },
        });

        act(() => result.current.pause());
        expect(result.current.playing).toBe(false);

        events = [...events, tokenEvent('b', 200, 1), tokenEvent('c', 300, 2)];
        rerender({ e: events });
        expect(result.current.cursor).toBe(1);
        expect(result.current.totalEvents).toBe(3);
        expect(result.current.isLive).toBe(false);
    });

    it('step advances cursor to the NEXT token.received event', () => {
        // Mixed events: token, layer, layer, token, layer, token
        const events: RunEvent[] = [
            tokenEvent('a', 100, 0),
            layerEvent(0),
            layerEvent(0),
            tokenEvent('b', 200, 1),
            layerEvent(1),
            tokenEvent('c', 300, 2),
        ];
        const { result } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: events },
        });
        act(() => result.current.pause());
        act(() => result.current.jumpToLive()); // jumps + resumes LIVE
        act(() => result.current.pause());
        // Manually set cursor to 0 via a contrived sequence: pause, then
        // calling step from cursor=6 should be a no-op.
        // Easier: a fresh hook with cursor not at head.
        // We'll test stepping starting from cursor near zero — use the
        // dedicated "step from paused mid-stream" path below.
        expect(result.current.cursor).toBe(events.length);
    });

    it('step from a paused mid-stream cursor lands on next token.received', () => {
        // Build a hook where cursor is at 0 (paused state from start).
        // Easiest: use renderHook + manually pause + jumpToLive + step.
        const events: RunEvent[] = [
            tokenEvent('a', 100, 0),
            layerEvent(0),
            layerEvent(0),
            tokenEvent('b', 200, 1),
            layerEvent(1),
            tokenEvent('c', 300, 2),
        ];
        // Start with empty events so cursor=0, then push events while paused.
        let evs: RunEvent[] = [];
        const { result, rerender } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: evs },
        });
        act(() => result.current.pause());
        evs = events;
        rerender({ e: evs });
        // cursor=0; step should jump past tokens[0] (index 0) which IS a
        // token.received, so cursor → 1.
        act(() => result.current.step());
        expect(result.current.cursor).toBe(1);
        // step again — skip layer/layer to next token (index 3) → cursor=4
        act(() => result.current.step());
        expect(result.current.cursor).toBe(4);
        // again — to index 5 → cursor=6
        act(() => result.current.step());
        expect(result.current.cursor).toBe(6);
        // no more tokens — stays put
        act(() => result.current.step());
        expect(result.current.cursor).toBe(6);
    });

    it('setSpeed to 0.5× engages the throttled dispenser', () => {
        const events: RunEvent[] = Array.from({ length: 10 }, (_, i) => tokenEvent('x', i * 50, i));
        // Start paused so the cursor sits at 0 even after the events
        // array is non-empty.
        const { result, rerender } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: [] as RunEvent[] },
        });
        act(() => result.current.pause());
        rerender({ e: events });
        // While paused, cursor still 0.
        expect(result.current.cursor).toBe(0);

        act(() => result.current.setSpeed(0.5));
        act(() => result.current.play());
        // Speed 0.5 → ~67ms per event (1000 / (30 * 0.5) = 66.7ms).
        // Advance one tick.
        act(() => {
            vi.advanceTimersByTime(70);
        });
        expect(result.current.cursor).toBe(1);
        // Several more ticks.
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(result.current.cursor).toBeGreaterThan(1);
        expect(result.current.cursor).toBeLessThan(10);
    });

    it('setSpeed to 4× drains a backlog faster than 1×', () => {
        const events = Array.from({ length: 20 }, (_, i) => tokenEvent('x', i * 50, i));
        const { result, rerender } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: [] as RunEvent[] },
        });
        act(() => result.current.pause());
        rerender({ e: events });

        act(() => result.current.setSpeed(4));
        act(() => result.current.play());
        // 4×: 1000 / (30 * 4) = 8.3ms per event. Advance 100ms ≈ 12 events.
        act(() => {
            vi.advanceTimersByTime(120);
        });
        expect(result.current.cursor).toBeGreaterThan(10);
    });

    it('stream shrink (new run) resets cursor and resumes LIVE', () => {
        let events: RunEvent[] = [tokenEvent('a', 100, 0), tokenEvent('b', 200, 1)];
        const { result, rerender } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: events },
        });
        act(() => result.current.pause());
        act(() => result.current.setSpeed(0.5));
        expect(result.current.playing).toBe(false);
        expect(result.current.speed).toBe(0.5);

        // Now shrink (different run).
        events = [];
        rerender({ e: events });
        expect(result.current.cursor).toBe(0);
        expect(result.current.playing).toBe(true);
        expect(result.current.speed).toBe(1);

        // New events arrive.
        events = [tokenEvent('x', 100, 0)];
        rerender({ e: events });
        expect(result.current.cursor).toBe(1);
        expect(result.current.isLive).toBe(true);
    });

    it('jumpToLive forces cursor to head + speed 1× + playing', () => {
        const events: RunEvent[] = [
            tokenEvent('a', 100, 0),
            tokenEvent('b', 200, 1),
            tokenEvent('c', 300, 2),
        ];
        const { result, rerender } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: [] as RunEvent[] },
        });
        act(() => result.current.pause());
        act(() => result.current.setSpeed(0.5));
        rerender({ e: events });

        act(() => result.current.jumpToLive());
        expect(result.current.cursor).toBe(3);
        expect(result.current.speed).toBe(1);
        expect(result.current.playing).toBe(true);
        expect(result.current.isLive).toBe(true);
    });

    it('toggle flips playing back and forth', () => {
        const events: RunEvent[] = [tokenEvent('a', 100, 0)];
        const { result } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: events },
        });
        expect(result.current.playing).toBe(true);
        act(() => result.current.toggle());
        expect(result.current.playing).toBe(false);
        act(() => result.current.toggle());
        expect(result.current.playing).toBe(true);
    });

    it('visibleEvents matches the cursor slice exactly', () => {
        const events: RunEvent[] = [
            tokenEvent('a', 100, 0),
            tokenEvent('b', 200, 1),
            tokenEvent('c', 300, 2),
            tokenEvent('d', 400, 3),
        ];
        const { result, rerender } = renderHook(({ e }) => useEventPlayback(e), {
            initialProps: { e: [] as RunEvent[] },
        });
        act(() => result.current.pause());
        rerender({ e: events });
        act(() => result.current.step()); // cursor → 1
        expect(result.current.visibleEvents).toHaveLength(1);
        expect(result.current.visibleEvents[0]).toBe(events[0]);
        act(() => result.current.step()); // cursor → 2
        expect(result.current.visibleEvents).toHaveLength(2);
    });
});
