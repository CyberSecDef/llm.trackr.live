import { Pause, Play, Radio, SkipForward } from 'lucide-react';
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '@/hooks/useEventPlayback';
import { cn } from '@/lib/utils';

/*
 * PlaybackControls (M8 chunk 8) — compact controls bar that sits
 * above the right-pane tab toggle in `Threads/Show`.
 *
 * Buttons + indicator:
 *   - Play/Pause toggle (icon flips by state)
 *   - Step → advance to next token.received event
 *   - LIVE pill OR "cursor / total" counter
 *   - Speed segmented control: 0.5× / 1× / 2× / 4×
 *
 * The component is dumb: it dispatches to the hook's actions and
 * reads its state. All semantics (LIVE auto-sync, throttle math,
 * stream-shrink reset) live in `useEventPlayback`.
 */

interface PlaybackControlsProps {
    playing: boolean;
    speed: PlaybackSpeed;
    cursor: number;
    totalEvents: number;
    isLive: boolean;
    onToggle: () => void;
    onStep: () => void;
    onSpeedChange: (s: PlaybackSpeed) => void;
    onJumpToLive: () => void;
}

export default function PlaybackControls({
    playing,
    speed,
    cursor,
    totalEvents,
    isLive,
    onToggle,
    onStep,
    onSpeedChange,
    onJumpToLive,
}: PlaybackControlsProps) {
    const behind = totalEvents - cursor;
    return (
        <div
            className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-2 py-1"
            data-testid="playback-controls"
            role="toolbar"
            aria-label="Playback controls"
        >
            <button
                type="button"
                onClick={onToggle}
                className="rounded p-1 text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={playing ? 'Pause playback' : 'Play playback'}
                data-testid="playback-toggle"
                data-playing={playing ? 'true' : 'false'}
            >
                {playing ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
            </button>

            <button
                type="button"
                onClick={onStep}
                className="rounded p-1 text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Step to next token"
                title="Advance one token"
                data-testid="playback-step"
                disabled={cursor >= totalEvents}
            >
                <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            {isLive ? (
                <span
                    className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300"
                    data-testid="playback-live-pill"
                >
                    <Radio className="h-2.5 w-2.5 animate-pulse" aria-hidden="true" />
                    Live
                </span>
            ) : (
                <button
                    type="button"
                    onClick={onJumpToLive}
                    className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    title="Jump to live"
                    data-testid="playback-cursor-jump"
                >
                    {cursor}/{totalEvents}
                    {behind > 0 && <span className="ml-1">(−{behind})</span>}
                </button>
            )}

            <div className="flex-1" />

            <div
                className="flex rounded-md border border-border"
                role="group"
                aria-label="Playback speed"
                data-testid="playback-speeds"
            >
                {PLAYBACK_SPEEDS.map((s, i) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => onSpeedChange(s)}
                        aria-pressed={speed === s}
                        className={cn(
                            'px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            i === 0 && 'rounded-l-[5px]',
                            i === PLAYBACK_SPEEDS.length - 1 && 'rounded-r-[5px]',
                            speed === s
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                        )}
                        data-testid={`playback-speed-${s}`}
                    >
                        {s}×
                    </button>
                ))}
            </div>
        </div>
    );
}
