import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunEvent } from '@/types/runs';

/*
 * useEventPlayback (M8 chunk 8) — playback controls over a live or
 * replayed event stream.
 *
 * Semantics per chunk-8 decision:
 *   - 1× = LIVE. cursor follows events.length on every render.
 *     Pass-through; no artificial delay.
 *   - 0.5× = deliberate throttle. setInterval dispenses one event
 *     every (1000 / (BASE_RATE * 0.5)) ms = ~67ms → ~15 events/s.
 *     Buffer grows when source is faster.
 *   - 2× / 4× = drain mode. dispenses faster than typical source
 *     rates so accumulated backlogs catch up quickly; once at the
 *     head, cursor stops advancing until more events arrive.
 *   - pause: cursor stays put; backlog grows.
 *   - step: advance to the NEXT `token.received` event, skipping
 *     intermediate events (per chunk-8 decision). Works regardless
 *     of playing state.
 *
 * Stream-shrink (events.length decreased — new run or SSE replay)
 * resets cursor to the new head and resumes LIVE so a fresh run
 * doesn't display a blank viz.
 */

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4];

/** Target events-per-second at 1× when in throttle mode (not used
 *  for the actual 1× path which just follows live). */
const BASE_RATE = 30;

export interface UseEventPlaybackResult {
    /** events.slice(0, cursor) — the events all viz consumers should read. */
    visibleEvents: RunEvent[];
    /** Index into events; visibleEvents.length === cursor. */
    cursor: number;
    totalEvents: number;
    playing: boolean;
    speed: PlaybackSpeed;
    /** True when playing at 1× AND cursor is at events.length. */
    isLive: boolean;
    play(): void;
    pause(): void;
    toggle(): void;
    /** Advance cursor to the next token.received event. */
    step(): void;
    setSpeed(s: PlaybackSpeed): void;
    /** Force cursor to the head; resume playing at 1×. */
    jumpToLive(): void;
}

export function useEventPlayback(events: RunEvent[]): UseEventPlaybackResult {
    const [cursor, setCursor] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);

    // Track the previous events.length so we can detect the
    // shrink-on-new-run case without a deep equality check.
    const prevLengthRef = useRef(events.length);

    // Stream-shrink → reset cursor to head + resume live. Same
    // length on first mount also takes this path (prevLengthRef starts
    // at events.length so the condition is false initially — correct).
    useEffect(() => {
        if (events.length < prevLengthRef.current) {
            setCursor(events.length);
            setPlaying(true);
            setSpeed(1);
        }
        prevLengthRef.current = events.length;
    }, [events.length]);

    // LIVE mode (speed === 1 && playing): keep cursor synced to head.
    useEffect(() => {
        if (!playing || speed !== 1) return;
        if (cursor !== events.length) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCursor(events.length);
        }
    }, [playing, speed, events.length, cursor]);

    // Throttled dispenser (speed !== 1 && playing). Advances cursor
    // by 1 per tick until it reaches events.length.
    useEffect(() => {
        if (!playing || speed === 1) return;
        const intervalMs = Math.max(8, 1000 / (BASE_RATE * speed));
        const handle = setInterval(() => {
            setCursor((c) => {
                if (c >= events.length) return c;
                return c + 1;
            });
        }, intervalMs);
        return () => clearInterval(handle);
    }, [playing, speed, events.length]);

    const play = useCallback(() => setPlaying(true), []);
    const pause = useCallback(() => setPlaying(false), []);
    const toggle = useCallback(() => setPlaying((p) => !p), []);

    const step = useCallback(() => {
        setCursor((c) => {
            for (let i = c; i < events.length; i++) {
                if (events[i].event === 'token.received') {
                    return i + 1;
                }
            }
            // No further token.received — stay put.
            return c;
        });
    }, [events]);

    const jumpToLive = useCallback(() => {
        setCursor(events.length);
        setPlaying(true);
        setSpeed(1);
    }, [events.length]);

    const isLive = playing && speed === 1 && cursor === events.length;

    return {
        visibleEvents: cursor >= events.length ? events : events.slice(0, cursor),
        cursor: Math.min(cursor, events.length),
        totalEvents: events.length,
        playing,
        speed,
        isLive,
        play,
        pause,
        toggle,
        step,
        setSpeed,
        jumpToLive,
    };
}
