import { useMemo } from 'react';
import TokenPill from '@/Components/Viz/TokenPill';
import {
    LOOP_ITERATION_DURATIONS,
    LOOP_TOTAL_DURATION,
    iterationAtTime,
    synthesizeAutoregressiveLoop,
    type LoopIteration,
} from '@/lib/syntheticAutoregression';
import { type LoopIterationState, type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 18 — Autoregressive loop (M13 chunk 9a).
 *
 * Per `phase1.md:1028` + `visualization.md:139-143`:
 *   "Now the meta-loop. Full sequence (input + generated so far)
 *   becomes the new input. Compress Scenes 5-17 into ~2s for
 *   token #2, ~1.5s for #3, accelerating to ~200ms/token by
 *   token #10+. The real run drives token timing via the
 *   WebSocket… Critical: maintain the chat bubble in the corner
 *   growing in real-time."
 *
 * For chunk 9a's animation, we play 7 iterations with decelerating
 * durations (LOOP_ITERATION_DURATIONS = [2000, 1500, 1100, 800,
 * 600, 500, 400]). Each iteration shows a compressed beam-through-
 * layers beat + new token sliding into the cumulative chat tray.
 *
 * Per-iteration phases (local t ∈ [0, 1]):
 *   0.00 - 0.30 : sequence flash — current input row pulses
 *   0.30 - 0.70 : compute beat — beam streak through the layer
 *                 stack icon; new-token preview hovers
 *   0.70 - 1.00 : new token slides into the cumulative tray
 *
 * Output state: `loopIterations` (the per-iter timeline) and an
 * extended `generatedTokens` (Scene 17's seed token + 7 new ones).
 */

const LOOP_SEED_KEY = 0xfeedfade;

interface AutoregressiveLoopSceneProps {
    t: number;
    state: PipelineState;
}

function AutoregressiveLoopScene({ t, state }: AutoregressiveLoopSceneProps) {
    const iterations = useMemo(() => buildIterations(state), [state]);
    const { iteration, localT } = useMemo(() => iterationAtTime(t, iterations), [t, iterations]);

    if (!iteration) {
        return (
            <div
                className="flex h-full w-full items-center justify-center p-3 text-[10px] font-mono text-muted-foreground/70"
                data-testid="scene-18-empty"
            >
                Scene 18 · waiting for prior scenes
            </div>
        );
    }

    const seedTokens = state.generatedTokens ?? [];
    // Tokens fully landed by the current iteration: all iters before
    // this one PLUS this one if localT >= 0.7.
    const completedThroughThisIter = iteration.iterationIndex - 1 + (localT >= 0.7 ? 1 : 0);
    const completedFromLoop = iterations.slice(0, Math.max(0, completedThroughThisIter));
    const cumulativeTokens = [
        ...seedTokens,
        ...completedFromLoop.map((it) => ({
            vocabIndex: it.vocabIndex,
            string: it.string,
        })),
    ];

    const iterationCount = iterations.length;
    const tokenInFlight = localT >= 0.3 && localT < 0.7;
    const tokenLanding = localT >= 0.7;

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-18-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-18-caption"
            >
                Scene 18 · Autoregressive loop
            </p>

            <p
                className="text-[9px] font-mono text-muted-foreground"
                data-testid="scene-18-iter-label"
            >
                Iteration <span className="text-cyan-300">{iteration.iterationIndex}</span> /{' '}
                <span className="text-cyan-300">{iterationCount}</span>
                {' · '}
                this token: <span className="text-cyan-300">{iteration.durationMs}ms</span>
            </p>

            {/* Compute beat: a small beam-through-layers icon */}
            <div className="flex items-center justify-center gap-3" data-testid="scene-18-compute">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
                    Input sequence ({cumulativeTokens.length + (state.tokens?.length ?? 0)} tokens)
                </span>
                <svg width={84} height={28} aria-hidden="true" data-testid="scene-18-beam">
                    {/* Tiny stacked-floor icon */}
                    {Array.from({ length: 5 }, (_, i) => (
                        <rect
                            key={i}
                            x={28}
                            y={2 + i * 5}
                            width={28}
                            height={3}
                            fill="#1e293b"
                            stroke="#334155"
                            strokeWidth={0.4}
                        />
                    ))}
                    {/* Beam */}
                    {tokenInFlight && (
                        <line
                            x1={42}
                            y1={4}
                            x2={42}
                            y2={26}
                            stroke="#10b981"
                            strokeWidth={1.5}
                            opacity={0.8}
                            data-testid="scene-18-beam-line"
                        />
                    )}
                    <text x={68} y={18} fontSize="8" fill="#94a3b8">
                        →
                    </text>
                </svg>
                {tokenInFlight ? (
                    <span
                        className="rounded border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono text-emerald-300"
                        style={{ opacity: 0.4 + (localT - 0.3) * 1.5 }}
                        data-testid="scene-18-incoming-token"
                    >
                        {prettify(iteration.string)}
                    </span>
                ) : tokenLanding ? (
                    <span
                        className="rounded border border-emerald-500/70 bg-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-200"
                        data-testid="scene-18-landed-token"
                    >
                        {prettify(iteration.string)}
                    </span>
                ) : (
                    <span className="text-[9px] text-muted-foreground/40">...</span>
                )}
            </div>

            {/* Cumulative chat tray */}
            <div
                className="flex w-full max-w-3xl flex-col items-center gap-1 rounded-md border border-border bg-card/40 p-2"
                data-testid="scene-18-tray"
            >
                <p className="text-[9px] font-medium uppercase tracking-wider text-emerald-400">
                    Chat bubble · {cumulativeTokens.length} tokens
                </p>
                <div
                    className="flex flex-wrap items-center justify-start gap-1"
                    data-testid="scene-18-tray-row"
                >
                    {cumulativeTokens.map((tok, i) => (
                        <TokenPill
                            key={i}
                            tokenId={tok.vocabIndex}
                            label={prettify(tok.string)}
                            size="sm"
                        />
                    ))}
                </div>
            </div>

            <p className="max-w-md text-center text-[9px] italic text-muted-foreground/70">
                Each iteration runs the full pipeline (Scenes 5–17) again on the growing sequence.
                Real runs accelerate from ~2s to ~200ms/token as the WebSocket stream feeds tokens;
                this synthetic loop covers {iterationCount} iterations.
            </p>
        </div>
    );
}

function prettify(s: string): string {
    if (s === ' ') return '·';
    if (s === '\n') return '↵';
    if (s.startsWith(' ')) return '·' + s.slice(1);
    return s;
}

function buildIterations(state: PipelineState): LoopIteration[] {
    if (state.loopIterations && state.loopIterations.length > 0) {
        // Cast PipelineState's LoopIterationState[] → LoopIteration[]
        // (shapes are identical; the two names exist so PipelineState
        // doesn't depend on the autoregression module's type).
        return state.loopIterations.map((it: LoopIterationState) => ({
            ...it,
        }));
    }
    return synthesizeAutoregressiveLoop(LOOP_SEED_KEY, LOOP_ITERATION_DURATIONS);
}

export const SCENE_AUTOREGRESSIVE_LOOP: Scene<PipelineState, PipelineState> = {
    id: 'autoregressive-loop',
    durationMs: LOOP_TOTAL_DURATION,
    render: (t, state) => <AutoregressiveLoopScene t={t} state={state} />,
    transform: (state) => {
        if (state.loopIterations && state.loopIterations.length > 0) return state;
        const iterations = synthesizeAutoregressiveLoop(LOOP_SEED_KEY, LOOP_ITERATION_DURATIONS);
        const prior = state.generatedTokens ?? [];
        const appended = iterations.map((it) => ({
            vocabIndex: it.vocabIndex,
            string: it.string,
        }));
        return {
            ...state,
            loopIterations: iterations,
            generatedTokens: [...prior, ...appended],
        };
    },
};

export default AutoregressiveLoopScene;
