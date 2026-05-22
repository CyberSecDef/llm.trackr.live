import { useMemo } from 'react';
import {
    pickTopK,
    sampleByMode,
    softmax,
    synthesizeLogits,
    syntheticTokenString,
    topPCutoffIndex,
    type SamplingMode,
} from '@/lib/syntheticLogits';
import { viridisAt } from '@/lib/vizColors';
import { type PipelineState, type ProbabilityBar, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 16 — Sampling (M13 chunk 8b).
 *
 * Per `phase1.md:1026` + `visualization.md:124-133`. Mode-aware
 * visualization picks a single token from the Scene 15 probability
 * bars:
 *
 *   greedy: dart slams down on bar #1.
 *   top_k:  bars beyond k fade; dart wobbles among survivors.
 *   top_p:  fill-line sweeps L→R until cumulative-p reached;
 *           bars past the line fade; dart picks from the rest.
 *
 * Phases within t (1500ms):
 *   0.00 - 0.30 : bars + mode indicator visible; dart hovers
 *   0.30 - 0.70 : mode-specific narrowing (fade beyond k / fill
 *                 line sweep / dart wobble)
 *   0.70 - 1.00 : chosen bar pulses bright; winning token string
 *                 flashes above
 *
 * Output state: `sampledToken` — `{ vocabIndex, string, prob }`.
 * Determined by `sampleByMode()` with the mode + K + P from
 * PipelineState (defaults: greedy / 40 / 0.95).
 */

const TOP_K_RENDER = 16;
const BAR_AREA_WIDTH = 600;
const BAR_AREA_HEIGHT = 150;
const DEFAULT_VOCAB_SIZE = 128_000;
const LOGITS_SCENE_SEED = 0xc0ffee;

interface SamplingSceneProps {
    t: number;
    state: PipelineState;
}

function SamplingScene({ t, state }: SamplingSceneProps) {
    const { bars, sampledIndex } = useMemo(() => buildSamplingState(state), [state]);

    const mode: SamplingMode = state.samplingMode ?? 'greedy';
    const samplingK = state.samplingK ?? 40;
    const samplingP = state.samplingP ?? 0.95;

    // Phase fractions.
    const narrowPhase = Math.max(0, Math.min((t - 0.3) / 0.4, 1));
    const pulsePhase = Math.max(0, Math.min((t - 0.7) / 0.3, 1));

    // Mode-specific cutoff position (in bar index).
    const topPCut = topPCutoffIndex(
        bars.map((b) => b.prob),
        samplingP,
    );
    const effectiveCutIndex =
        mode === 'top_k' ? Math.min(samplingK, bars.length) - 1 : mode === 'top_p' ? topPCut : 0; // greedy

    const barWidth = BAR_AREA_WIDTH / bars.length;
    const maxProb = bars.length > 0 ? bars[0].prob : 1;

    // Dart x position: hovers above bar 0 by default; for top_k/top_p
    // it wobbles among bars [0, effectiveCutIndex] during narrowPhase,
    // settles on `sampledIndex` by the end.
    const dartIdx = computeDartIndex(t, mode, effectiveCutIndex, sampledIndex, bars.length);
    const dartX = dartIdx * barWidth + barWidth / 2;

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-16-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-16-caption"
            >
                Scene 16 · Sampling
            </p>
            <p
                className="text-[9px] font-mono text-muted-foreground"
                data-testid="scene-16-mode-label"
            >
                Mode: <span className="text-cyan-300">{labelForMode(mode)}</span>
                {mode === 'top_k' && (
                    <>
                        {' '}
                        · k = <span className="text-cyan-300">{samplingK}</span>
                    </>
                )}
                {mode === 'top_p' && (
                    <>
                        {' '}
                        · p = <span className="text-cyan-300">{samplingP.toFixed(2)}</span>
                    </>
                )}
            </p>

            {/* Winning token flash, above the chosen bar */}
            {pulsePhase > 0 && bars[sampledIndex] && (
                <p
                    className="text-sm font-mono font-semibold text-emerald-300"
                    style={{ opacity: pulsePhase }}
                    data-testid="scene-16-winning-string"
                >
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5">
                        {prettifyToken(bars[sampledIndex].string)}
                    </span>
                </p>
            )}

            <svg
                width={BAR_AREA_WIDTH}
                height={BAR_AREA_HEIGHT}
                aria-label={`Sampling mode: ${mode}`}
                data-testid="scene-16-bars"
            >
                {bars.map((bar, i) => {
                    const probNorm = bar.prob / Math.max(1e-6, maxProb);
                    const barH = probNorm * (BAR_AREA_HEIGHT - 28);
                    const isSelected = i === sampledIndex;
                    const isBeyondCutoff = i > effectiveCutIndex;
                    const fadeAmount = isBeyondCutoff ? narrowPhase : 0;
                    const barOpacity = 0.9 - fadeAmount * 0.75;
                    const isPulsing = isSelected && pulsePhase > 0;
                    const pulseScale = isPulsing ? 1 + 0.2 * Math.sin(t * 30) : 1;
                    return (
                        <g
                            key={i}
                            data-testid={`scene-16-bar-${i}${isSelected ? '-selected' : ''}`}
                        >
                            <rect
                                x={i * barWidth + 0.5}
                                y={BAR_AREA_HEIGHT - 20 - barH * pulseScale}
                                width={barWidth - 1}
                                height={Math.max(0.5, barH * pulseScale)}
                                fill={isPulsing ? '#34d399' : viridisAt(probNorm)}
                                opacity={barOpacity}
                            />
                        </g>
                    );
                })}

                {/* Top-P fill line (only in top_p mode) */}
                {mode === 'top_p' && narrowPhase > 0 && (
                    <line
                        x1={Math.min(
                            BAR_AREA_WIDTH,
                            narrowPhase * (effectiveCutIndex + 1) * barWidth,
                        )}
                        y1={0}
                        x2={Math.min(
                            BAR_AREA_WIDTH,
                            narrowPhase * (effectiveCutIndex + 1) * barWidth,
                        )}
                        y2={BAR_AREA_HEIGHT - 20}
                        stroke="#fbbf24"
                        strokeWidth={1.5}
                        opacity={0.8}
                        data-testid="scene-16-fill-line"
                    />
                )}

                {/* Dart pointer above the active bar */}
                <g data-testid="scene-16-dart">
                    <polygon
                        points={`${dartX},${10} ${dartX - 5},${0} ${dartX + 5},${0}`}
                        fill="#fbbf24"
                        opacity={t < 0.95 ? 0.9 : 0.4}
                    />
                    <line
                        x1={dartX}
                        y1={10}
                        x2={dartX}
                        y2={BAR_AREA_HEIGHT - 22}
                        stroke="#fbbf24"
                        strokeWidth={0.6}
                        strokeDasharray="2 2"
                        opacity={t < 0.7 ? 0.5 : 0.2}
                    />
                </g>
            </svg>

            <p className="max-w-md text-center text-[9px] italic text-muted-foreground/70">
                {explanationForMode(mode)}
            </p>
        </div>
    );
}

function computeDartIndex(
    t: number,
    mode: SamplingMode,
    cutoffIndex: number,
    sampledIndex: number,
    barCount: number,
): number {
    if (mode === 'greedy') return 0;
    if (t < 0.3) return 0;
    if (t >= 0.7) return sampledIndex;
    // Wobble: linear progression with sine jitter among survivors.
    const wobblePhase = (t - 0.3) / 0.4;
    const survivors = Math.max(1, cutoffIndex + 1);
    const baseIdx = Math.floor(wobblePhase * survivors);
    const jitter = Math.floor(Math.sin(t * 60) * 2);
    return Math.max(0, Math.min(survivors - 1, baseIdx + jitter)) % barCount;
}

function labelForMode(mode: SamplingMode): string {
    switch (mode) {
        case 'greedy':
            return 'Greedy (argmax)';
        case 'top_k':
            return 'Top-K';
        case 'top_p':
            return 'Top-P (nucleus)';
    }
}

function explanationForMode(mode: SamplingMode): string {
    switch (mode) {
        case 'greedy':
            return 'Greedy sampling: always pick the highest-probability token. Deterministic but can feel mechanical.';
        case 'top_k':
            return 'Top-K: keep only the K highest-probability tokens, then sample from them weighted by probability.';
        case 'top_p':
            return 'Top-P (nucleus): keep the smallest set of tokens whose cumulative probability reaches P, then sample.';
    }
}

function prettifyToken(s: string): string {
    if (s === ' ') return '·';
    if (s === '\n') return '↵';
    if (s.startsWith(' ')) return '·' + s.slice(1);
    return s;
}

function sourceLogits(state: PipelineState): readonly number[] {
    if (state.logits) return state.logits;
    const inputs =
        state.finalNormed ??
        state.residualOutput2 ??
        state.ffnOutput ??
        state.residualOutput ??
        state.attentionOutput ??
        [];
    if (inputs.length === 0) return [];
    const last = inputs[inputs.length - 1] ?? [];
    const vocabSize = state.vocabSize ?? DEFAULT_VOCAB_SIZE;
    return synthesizeLogits(last, vocabSize, LOGITS_SCENE_SEED).values;
}

function buildSamplingState(state: PipelineState): {
    bars: ProbabilityBar[];
    sampledIndex: number;
} {
    if (state.probabilities && state.probabilities.length > 0) {
        const probs = state.probabilities.map((b) => b.prob);
        const sampledIndex = sampleByMode(
            probs,
            state.samplingMode ?? 'greedy',
            state.samplingK ?? 40,
            state.samplingP ?? 0.95,
            state.tokens?.length ?? 0,
        );
        return { bars: [...state.probabilities], sampledIndex };
    }
    const logits = sourceLogits(state);
    if (logits.length === 0) return { bars: [], sampledIndex: 0 };
    const topK = pickTopK(logits, TOP_K_RENDER);
    const probs = softmax(
        topK.map((e) => e.value),
        state.samplingTemperature ?? 1.0,
    );
    const bars: ProbabilityBar[] = topK.map((entry, i) => ({
        vocabIndex: entry.index,
        prob: probs[i],
        string: syntheticTokenString(i),
    }));
    const sampledIndex = sampleByMode(
        probs,
        state.samplingMode ?? 'greedy',
        state.samplingK ?? 40,
        state.samplingP ?? 0.95,
        state.tokens?.length ?? 0,
    );
    return { bars, sampledIndex };
}

export const SCENE_SAMPLING: Scene<PipelineState, PipelineState> = {
    id: 'sampling',
    durationMs: 1500,
    render: (t, state) => <SamplingScene t={t} state={state} />,
    transform: (state) => {
        if (state.sampledToken) return state;
        const { bars, sampledIndex } = buildSamplingState(state);
        if (bars.length === 0) return state;
        const winner = bars[sampledIndex];
        return {
            ...state,
            probabilities: state.probabilities ?? bars,
            sampledToken: {
                vocabIndex: winner.vocabIndex,
                string: winner.string,
                prob: winner.prob,
            },
        };
    },
};

export default SamplingScene;
