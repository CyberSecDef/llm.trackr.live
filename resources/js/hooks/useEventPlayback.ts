import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunEvent } from '@/types/runs';

/*
 * useEventPlayback (M8 chunk 8 / extended M9 chunk 1) — playback
 * controls over a live OR replayed event stream.
 *
 * Mode (M9 chunk 1):
 *   - 'live' (default): 1× = LIVE head-sync (cursor follows
 *     events.length); 0.5× / 2× / 4× = throttled dispenser.
 *   - 'replay': 1× = throttled dispenser at BASE_RATE × 1; no
 *     head-sync ever. Use when events is a static array (Replay
 *     page) and you want 1× to mean "play forward at the natural
 *     rate" rather than "jump to end."
 *
 * Other semantics (unchanged):
 *   - 0.5× = deliberate throttle (~15 events/sec at BASE_RATE 30).
 *   - 2× / 4× = drain faster than typical source rate.
 *   - pause: cursor stays put.
 *   - step: advance to next `token.received` event.
 *   - stream-shrink resets cursor + resumes LIVE (live mode only;
 *     no-op in replay mode where events is static anyway).
 */

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;
export type PlaybackMode = 'live' | 'replay';

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4];

const BASE_RATE = 30; // target events/sec at 1× in throttle mode

export interface UseEventPlaybackOptions {
    /** 'live' = head-sync at 1× (default). 'replay' = throttle at every speed. */
    mode?: PlaybackMode;
    /** Initial playing state. Defaults to true. Replay pages typically pass false. */
    initialPlaying?: boolean;
    /** Initial cursor. Defaults to 0. */
    initialCursor?: number;
    /** Initial speed. Defaults to 1×. */
    initialSpeed?: PlaybackSpeed;
}

export interface UseEventPlaybackResult {
    visibleEvents: RunEvent[];
    cursor: number;
    totalEvents: number;
    playing: boolean;
    speed: PlaybackSpeed;
    /** True when playing at 1× in LIVE mode AND cursor is at events.length. */
    isLive: boolean;
    /** True if mode === 'replay'. Exposed so the toolbar can hide the LIVE pill. */
    isReplay: boolean;
    play(): void;
    pause(): void;
    toggle(): void;
    step(): void;
    setSpeed(s: PlaybackSpeed): void;
    /** Force cursor to the head; resume playing at 1×. In replay mode this jumps to end. */
    jumpToLive(): void;
    /** Set cursor explicitly (replay scrubbing). */
    setCursor(c: number): void;
}

export function useEventPlayback(
    events: RunEvent[],
    options: UseEventPlaybackOptions = {},
): UseEventPlaybackResult {
    const mode = options.mode ?? 'live';
    const [cursor, setCursorState] = useState(options.initialCursor ?? 0);
    const [playing, setPlaying] = useState(options.initialPlaying ?? true);
    const [speed, setSpeed] = useState<PlaybackSpeed>(options.initialSpeed ?? 1);

    const prevLengthRef = useRef(events.length);

    // Stream-shrink (live mode only) → reset cursor to head + LIVE.
    useEffect(() => {
        if (mode !== 'live') {
            prevLengthRef.current = events.length;
            return;
        }
        if (events.length < prevLengthRef.current) {
            setCursorState(events.length);
            setPlaying(true);
            setSpeed(1);
        }
        prevLengthRef.current = events.length;
    }, [events.length, mode]);

    // LIVE head-sync — only in live mode at speed 1.
    useEffect(() => {
        if (mode !== 'live') return;
        if (!playing || speed !== 1) return;
        if (cursor !== events.length) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCursorState(events.length);
        }
    }, [mode, playing, speed, events.length, cursor]);

    // Throttled dispenser. Active in:
    //   live mode AND speed !== 1, OR
    //   replay mode AND playing.
    useEffect(() => {
        if (!playing) return;
        if (mode === 'live' && speed === 1) return; // handled by head-sync
        const intervalMs = Math.max(8, 1000 / (BASE_RATE * speed));
        const handle = setInterval(() => {
            setCursorState((c) => {
                if (c >= events.length) return c;
                return c + 1;
            });
        }, intervalMs);
        return () => clearInterval(handle);
    }, [mode, playing, speed, events.length]);

    const play = useCallback(() => setPlaying(true), []);
    const pause = useCallback(() => setPlaying(false), []);
    const toggle = useCallback(() => setPlaying((p) => !p), []);

    const step = useCallback(() => {
        setCursorState((c) => {
            for (let i = c; i < events.length; i++) {
                if (events[i].event === 'token.received') {
                    return i + 1;
                }
            }
            return c;
        });
    }, [events]);

    const jumpToLive = useCallback(() => {
        setCursorState(events.length);
        setPlaying(true);
        setSpeed(1);
    }, [events.length]);

    const setCursor = useCallback(
        (c: number) => {
            const clamped = Math.max(0, Math.min(events.length, Math.floor(c)));
            setCursorState(clamped);
        },
        [events.length],
    );

    const isLive = mode === 'live' && playing && speed === 1 && cursor === events.length;

    return {
        visibleEvents: cursor >= events.length ? events : events.slice(0, cursor),
        cursor: Math.min(cursor, events.length),
        totalEvents: events.length,
        playing,
        speed,
        isLive,
        isReplay: mode === 'replay',
        play,
        pause,
        toggle,
        step,
        setSpeed,
        jumpToLive,
        setCursor,
    };
}
