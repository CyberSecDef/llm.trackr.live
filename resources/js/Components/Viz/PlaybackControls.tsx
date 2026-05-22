import { cn } from '@/lib/utils';
import {
    PLAYBACK_SPEEDS,
    type SceneRunnerControls,
    type SceneRunnerState,
    type SceneSpeed,
} from '@/Components/Viz/useSceneRunner';

/*
 * PlaybackControls (M13 chunk 11a) — scene-level playback control
 * surface mounted below the canvas. Adapts the M8 chunk-8
 * `PlaybackControls` component (deleted in M13 chunk 1) to the
 * scene-runner contract:
 *
 *   - Play/pause toggle
 *   - Prev / Next scene (advances to next scene-boundary, NOT next
 *     event — per the chunk-11 spec literal)
 *   - Speed selector: 0.25× / 1× / 4× (PLAYBACK_SPEEDS)
 *   - Jump-to-live: skips to the scene matching the current
 *     token-stream position. Heuristic per chunk-11 decisions:
 *       no events            → no-op (button disabled)
 *       token.received only  → setScene(18) (autoregressive-loop)
 *       is_final received    → setScene(20) (detokenize / EOS)
 *
 * Per `phase1.md:1036` + `docs/visualization.md`. Visual style
 * matches the chunk-1 PipelineProgressBar (same border, padding,
 * focus-visible ring pattern from M12 chunk 2).
 */

export interface PlaybackControlsProps {
    state: SceneRunnerState;
    controls: SceneRunnerControls;
    /** Target scene for the "jump to live" button. Null disables
     *  the button. Computed by the parent from the events stream. */
    liveSceneIndex?: number | null;
}

export default function PlaybackControls({
    state,
    controls,
    liveSceneIndex = null,
}: PlaybackControlsProps) {
    const canJumpLive = liveSceneIndex !== null && liveSceneIndex !== state.sceneIndex;

    return (
        <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/40 p-2 text-[10px]"
            role="toolbar"
            aria-label="Playback controls"
            data-testid="viz-playback-controls"
        >
            {/* Play / pause */}
            <button
                type="button"
                onClick={controls.toggle}
                className={cn(
                    'rounded px-2 py-1 font-medium uppercase tracking-wider transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    state.playing
                        ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30',
                )}
                aria-label={state.playing ? 'Pause playback' : 'Resume playback'}
                aria-pressed={state.playing}
                data-testid="viz-playback-toggle"
            >
                {state.playing ? 'Pause' : 'Play'}
            </button>

            {/* Prev / Next scene */}
            <div
                className="flex items-center gap-px rounded border border-border bg-card/60"
                data-testid="viz-playback-step-group"
            >
                <button
                    type="button"
                    onClick={controls.prevScene}
                    disabled={state.sceneIndex === 0}
                    className={cn(
                        'rounded-l px-2 py-1 transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        state.sceneIndex === 0
                            ? 'cursor-not-allowed text-muted-foreground/30'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                    aria-label="Previous scene"
                    data-testid="viz-playback-prev"
                >
                    ◂◂
                </button>
                <button
                    type="button"
                    onClick={controls.nextScene}
                    disabled={state.sceneIndex >= state.totalScenes - 1}
                    className={cn(
                        'rounded-r px-2 py-1 transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        state.sceneIndex >= state.totalScenes - 1
                            ? 'cursor-not-allowed text-muted-foreground/30'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                    aria-label="Next scene"
                    data-testid="viz-playback-next"
                >
                    ▸▸
                </button>
            </div>

            {/* Speed selector */}
            <div
                className="flex items-center gap-px rounded border border-border bg-card/60"
                role="radiogroup"
                aria-label="Playback speed"
                data-testid="viz-playback-speed-group"
            >
                {PLAYBACK_SPEEDS.map((s, i) => {
                    const active = state.speed === s;
                    return (
                        <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => controls.setSpeed(s as SceneSpeed)}
                            className={cn(
                                'px-2 py-1 font-mono tabular-nums transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                i === 0 ? 'rounded-l' : '',
                                i === PLAYBACK_SPEEDS.length - 1 ? 'rounded-r' : '',
                                active
                                    ? 'bg-cyan-500/30 text-cyan-100 font-semibold'
                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                            )}
                            data-testid={`viz-playback-speed-${s}`}
                        >
                            {formatSpeed(s)}
                        </button>
                    );
                })}
            </div>

            {/* Jump-to-live */}
            <button
                type="button"
                onClick={() => {
                    if (liveSceneIndex !== null) controls.setScene(liveSceneIndex);
                }}
                disabled={!canJumpLive}
                className={cn(
                    'rounded px-2 py-1 font-medium uppercase tracking-wider transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    canJumpLive
                        ? 'bg-violet-500/20 text-violet-200 hover:bg-violet-500/30'
                        : 'cursor-not-allowed text-muted-foreground/30',
                )}
                aria-label="Jump to live"
                aria-disabled={!canJumpLive}
                data-testid="viz-playback-jump-live"
                title={
                    canJumpLive
                        ? 'Jump the visualization forward to the latest run scene'
                        : 'No live data ahead of the visualization'
                }
            >
                ⇥ Live
            </button>

            {/* Scene-position label (informational) */}
            <span
                className="ml-auto font-mono tabular-nums text-muted-foreground/70"
                data-testid="viz-playback-scene-label"
            >
                Scene {state.sceneIndex} / {state.totalScenes - 1}
                {' · '}t = {state.t.toFixed(2)}
            </span>
        </div>
    );
}

function formatSpeed(s: number): string {
    if (Number.isInteger(s)) return `${s}×`;
    return `${s}×`;
}
