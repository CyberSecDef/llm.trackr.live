import { useMemo } from 'react';
import { pickTopK, softmax, synthesizeLogits, syntheticTokenString } from '@/lib/syntheticLogits';
import { viridisAt } from '@/lib/vizColors';
import { type PipelineState, type ProbabilityBar, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 15 — Softmax → probabilities (M13 chunk 8b).
 *
 * Per `phase1.md:1026` + `visualization.md:118-122`: "The logits
 * row pivots 90° and becomes a horizontal bar chart, sorted
 * descending by value. A 'softmax' wave passes across it: bars
 * rescale so heights now represent probabilities summing to 1.
 * Most bars collapse to near-zero; a handful at the left dominate."
 *
 * Phases within t (2000ms):
 *   0.00 - 0.30 : top-K bars materialize, heights ∝ raw logits
 *   0.30 - 0.70 : softmax wave sweeps L→R, bars rescale
 *   0.70 - 1.00 : final probability layout settles; top-1 dominates
 *
 * Render: top-K bars (default 16). Each bar's height interpolates
 * between its raw-logit height (normalized) and its probability
 * height as the softmax wave passes its position.
 *
 * Output state: `probabilities` — sorted-desc top-K with
 * vocab indices + synthetic strings.
 */

const TOP_K_RENDER = 16;
const BAR_AREA_WIDTH = 600;
const BAR_AREA_HEIGHT = 140;
const DEFAULT_VOCAB_SIZE = 128_000;
const LOGITS_SCENE_SEED = 0xc0ffee;

interface SoftmaxSceneProps {
    t: number;
    state: PipelineState;
}

function SoftmaxScene({ t, state }: SoftmaxSceneProps) {
    const { topK, probs } = useMemo(() => buildProbabilityBars(state), [state]);
    const temperature = state.samplingTemperature ?? 1.0;
    // Wave sweeps L→R between t=0.3 and t=0.7. progress = bar's
    // L-edge position normalized to [0, 1].
    const waveActive = t >= 0.3 && t <= 0.7;
    const waveFraction = Math.max(0, Math.min((t - 0.3) / 0.4, 1));

    // Max logit for normalizing the "raw" bar heights to [0, 1].
    const maxLogit = topK.length > 0 ? topK[0].value : 1;
    const minLogit = topK.length > 0 ? topK[topK.length - 1].value : 0;
    const logitRange = Math.max(1e-6, maxLogit - minLogit);

    // Final probability max (top-1 always wins after softmax).
    const maxProb = probs.length > 0 ? Math.max(...probs) : 1;

    const barWidth = BAR_AREA_WIDTH / topK.length;

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-15-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-15-caption"
            >
                Scene 15 · Softmax → probabilities
            </p>
            <p
                className="text-[9px] font-mono text-muted-foreground"
                data-testid="scene-15-temperature"
            >
                Temperature: <span className="text-cyan-300">{temperature.toFixed(2)}</span> ·
                showing top {topK.length} of vocab
            </p>

            <svg
                width={BAR_AREA_WIDTH}
                height={BAR_AREA_HEIGHT}
                aria-label="Softmax probability bar chart"
                data-testid="scene-15-bars"
            >
                {topK.map((entry, i) => {
                    // Per-bar interpolation: bar i's mix = how far
                    // the L→R wave has progressed past position i/K.
                    const barPos = (i + 0.5) / topK.length;
                    const localProgress =
                        t < 0.3
                            ? 0
                            : t > 0.7
                              ? 1
                              : Math.max(0, Math.min((waveFraction - barPos + 0.15) / 0.3, 1));

                    const rawNorm = (entry.value - minLogit) / logitRange;
                    const probNorm = probs[i] / maxProb;
                    const heightNorm = rawNorm * (1 - localProgress) + probNorm * localProgress;
                    const barH = heightNorm * (BAR_AREA_HEIGHT - 18);

                    const isInWave = waveActive && Math.abs(barPos - waveFraction) < 0.05;

                    return (
                        <g key={i} data-testid={`scene-15-bar-${i}`}>
                            <rect
                                x={i * barWidth + 0.5}
                                y={BAR_AREA_HEIGHT - 16 - barH}
                                width={barWidth - 1}
                                height={Math.max(0.5, barH)}
                                fill={isInWave ? '#fbbf24' : viridisAt(heightNorm)}
                                opacity={0.9}
                            />
                            {/* Rank label every 4 bars */}
                            {i % 4 === 0 && (
                                <text
                                    x={i * barWidth + barWidth / 2}
                                    y={BAR_AREA_HEIGHT - 4}
                                    textAnchor="middle"
                                    fontSize="8"
                                    fill="#94a3b8"
                                >
                                    {i + 1}
                                </text>
                            )}
                        </g>
                    );
                })}
                {/* Softmax wave indicator (vertical line) */}
                {waveActive && (
                    <line
                        x1={waveFraction * BAR_AREA_WIDTH}
                        y1={0}
                        x2={waveFraction * BAR_AREA_WIDTH}
                        y2={BAR_AREA_HEIGHT - 16}
                        stroke="#fbbf24"
                        strokeWidth={1.5}
                        opacity={0.7}
                        data-testid="scene-15-wave-line"
                    />
                )}
            </svg>

            <p className="max-w-md text-center text-[9px] italic text-muted-foreground/70">
                Softmax converts raw logits to probabilities summing to 1. Top-1 dominates; the long
                tail collapses near zero.
            </p>
        </div>
    );
}

function sourceLogits(state: PipelineState): readonly number[] {
    if (state.logits) return state.logits;
    // Fall back: synthesize from last finalNormed / residualOutput2 vector.
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

function buildProbabilityBars(state: PipelineState): {
    topK: { value: number; index: number }[];
    probs: number[];
    bars: ProbabilityBar[];
} {
    const logits = sourceLogits(state);
    if (logits.length === 0) return { topK: [], probs: [], bars: [] };
    const topK = pickTopK(logits, TOP_K_RENDER);
    const sortedValues = topK.map((e) => e.value);
    const probs = softmax(sortedValues, state.samplingTemperature ?? 1.0);
    const bars: ProbabilityBar[] = topK.map((entry, i) => ({
        vocabIndex: entry.index,
        prob: probs[i],
        string: syntheticTokenString(i),
    }));
    return { topK, probs, bars };
}

export const SCENE_SOFTMAX: Scene<PipelineState, PipelineState> = {
    id: 'softmax',
    durationMs: 2000,
    render: (t, state) => <SoftmaxScene t={t} state={state} />,
    transform: (state) => {
        if (state.probabilities && state.probabilities.length > 0) return state;
        const { bars } = buildProbabilityBars(state);
        if (bars.length === 0) return state;
        return { ...state, probabilities: bars };
    },
};

export default SoftmaxScene;
