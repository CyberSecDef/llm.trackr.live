import { useMemo } from 'react';
import VectorStrip from '@/Components/Viz/VectorStrip';
import WeightFog from '@/Components/Viz/WeightFog';
import { downsampleLogits, synthesizeLogits } from '@/lib/syntheticLogits';
import { viridisAt } from '@/lib/vizColors';
import { layerNormalize, syntheticEmbedding } from '@/lib/syntheticEmbedding';
import { VISIBLE_EMBEDDING_DIM, type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 14 — LM Head / unembedding (M13 chunk 8a).
 *
 * Per `phase1.md:1026` + `visualization.md:112-116`:
 * "Only the LAST vector strip matters for next-token prediction —
 * make this dramatic. All other strips dim and fade. The final
 * strip floats to the center and gets projected through another
 * massive matrix that materializes (mirror of the embedding table
 * from Scene 5: 4096 × 128,000, labeled 'LM Head'). Beams shoot
 * through and emerge as a row of 128,000 raw logit values…
 * extremely long, mostly-cool-colored heatmap, with a few hot spikes."
 *
 * Phases within t (3000ms):
 *   0.00 - 0.20 : input strips visible; last one highlighted,
 *                 others fade to ~30% opacity
 *   0.20 - 0.45 : LM Head matrix materializes (WeightFog +
 *                 accent lines, mirror of Scene 5)
 *   0.45 - 0.75 : beam projects through matrix from last strip
 *   0.75 - 1.00 : logits heatmap emerges at the bottom
 *
 * Render strategy mirrors Scene 5: a WeightFog patch + 14
 * horizontal accent lines stand in for the 4096 × 128,000 grid;
 * the label communicates the real scale. Logits heatmap is
 * downsampled from `vocabSize` to ~1024 cells via max-pool so
 * spikes remain visible.
 *
 * Output state: `logits` — full vocab-length array used by
 * Scene 15's softmax bars.
 */

const DEFAULT_VOCAB_SIZE = 128_000;
const LOGITS_RENDER_CELLS = 1024;
const LOGITS_SCENE_SEED = 0xc0ffee;

interface LMHeadSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    inputs: readonly (readonly number[])[];
    vocabSize: number;
    logits: readonly number[];
}

function LMHeadScene({ t, tokens, inputs, vocabSize, logits }: LMHeadSceneProps) {
    const tokenList = tokens ?? [];

    const dimOpacity = Math.max(0.3, 1 - Math.min(1, t / 0.2) * 0.7);
    const matrixOpacity = Math.max(0, Math.min((t - 0.2) / 0.25, 1));
    const beamPhase = Math.max(0, Math.min((t - 0.45) / 0.3, 1));
    const logitsOpacity = Math.max(0, Math.min((t - 0.75) / 0.25, 1));

    const lastIndex = tokenList.length - 1;
    const vocabLabel = `4096 × ${formatVocabCount(vocabSize)}`;

    const downsampled = useMemo(() => downsampleLogits(logits, LOGITS_RENDER_CELLS), [logits]);

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-14-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-14-caption"
            >
                Scene 14 · LM Head / unembedding
            </p>

            {/* Top: token strips, last one highlighted */}
            <div
                className="flex flex-wrap items-center justify-center gap-1"
                data-testid="scene-14-input-strips"
            >
                {tokenList.slice(0, 6).map((tok, i) => {
                    const isLast = i === lastIndex || (lastIndex >= 6 && i === 5);
                    const opacity = isLast ? 1 : dimOpacity;
                    return (
                        <div
                            key={i}
                            className="flex flex-col items-center"
                            style={{ opacity }}
                            data-testid={`scene-14-strip-${i}${isLast ? '-last' : ''}`}
                        >
                            <VectorStrip
                                values={inputs[i] ?? []}
                                visibleCells={Math.min(64, (inputs[i] ?? []).length)}
                                totalLength={4096}
                                width={isLast ? 140 : 80}
                                height={isLast ? 12 : 9}
                            />
                            <span
                                className="mt-0.5 max-w-[60px] truncate text-[8px] text-muted-foreground/70"
                                title={tok.string}
                            >
                                {tok.string === ' ' ? '·' : tok.string}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Middle: LM Head matrix (WeightFog + label) */}
            <div
                className="relative flex h-32 w-full items-center justify-center"
                style={{ opacity: matrixOpacity }}
                data-testid="scene-14-matrix-region"
            >
                <WeightFog
                    width={520}
                    height={110}
                    density={8}
                    className="absolute inset-0 mx-auto"
                />
                <svg
                    width={520}
                    height={110}
                    className="absolute inset-0 mx-auto"
                    aria-hidden="true"
                >
                    {Array.from({ length: 14 }, (_, i) => {
                        const y = 8 + i * 7;
                        const isHot = i < Math.floor(beamPhase * 14);
                        return (
                            <line
                                key={i}
                                x1={20}
                                y1={y}
                                x2={500}
                                y2={y}
                                stroke={isHot ? '#67e8f9' : '#475569'}
                                strokeWidth={isHot ? 0.7 : 0.4}
                                opacity={isHot ? 0.85 : 0.35}
                            />
                        );
                    })}
                    {/* Beam from last strip down through the matrix */}
                    {beamPhase > 0 && (
                        <line
                            x1={260}
                            y1={0}
                            x2={260}
                            y2={beamPhase * 110}
                            stroke="#10b981"
                            strokeWidth={1.5}
                            opacity={0.7}
                            data-testid="scene-14-beam"
                        />
                    )}
                </svg>
                <div className="relative z-10 rounded-md border border-border bg-card/80 px-3 py-1.5 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        LM Head
                    </p>
                    <p className="font-mono text-sm font-semibold text-foreground">{vocabLabel}</p>
                    <p className="text-[9px] text-muted-foreground/70 italic">hidden dim × vocab</p>
                </div>
            </div>

            {/* Bottom: logits heatmap (long horizontal strip) */}
            {logitsOpacity > 0 && (
                <div
                    className="flex w-full max-w-3xl flex-col items-center gap-1"
                    style={{ opacity: logitsOpacity }}
                    data-testid="scene-14-logits"
                >
                    <p className="text-[9px] font-medium uppercase tracking-wider text-emerald-400">
                        Logits · {formatVocabCount(vocabSize)} cells
                    </p>
                    <LogitsHeatmap values={downsampled} width={620} height={14} />
                    <p className="max-w-md text-center text-[8px] italic text-muted-foreground/70">
                        Each cell is one possible next token. Most are near-zero; the spikes are the
                        candidates the model thinks are likely.
                    </p>
                </div>
            )}
        </div>
    );
}

interface LogitsHeatmapProps {
    values: readonly number[];
    width: number;
    height: number;
}

function LogitsHeatmap({ values, width, height }: LogitsHeatmapProps) {
    if (values.length === 0) return null;
    const max = Math.max(1e-6, ...values);
    const min = Math.min(...values);
    const range = Math.max(1e-6, max - min);
    const cellWidth = width / values.length;
    return (
        <svg width={width} height={height} aria-hidden="true" data-testid="scene-14-logits-heatmap">
            {values.map((v, i) => {
                const t = (v - min) / range;
                return (
                    <rect
                        key={i}
                        x={i * cellWidth}
                        y={0}
                        width={cellWidth + 0.5}
                        height={height}
                        fill={viridisAt(t)}
                    />
                );
            })}
        </svg>
    );
}

function formatVocabCount(n: number): string {
    if (n >= 1000) {
        const k = n / 1000;
        return `${k.toLocaleString(undefined, { maximumFractionDigits: 0 })},000`;
    }
    return String(n);
}

function sourceInputs(state: PipelineState): readonly (readonly number[])[] {
    return (
        state.finalNormed ??
        state.residualOutput2 ??
        state.ffnOutput ??
        state.residualOutput ??
        state.attentionOutput ??
        state.layerNormed ??
        state.positionEncoded ??
        state.embeddings ??
        (state.tokens
            ? state.tokens.map((tok) =>
                  layerNormalize(syntheticEmbedding(tok.id, VISIBLE_EMBEDDING_DIM)),
              )
            : [])
    );
}

function effectiveVocabSize(state: PipelineState): number {
    return state.vocabSize ?? DEFAULT_VOCAB_SIZE;
}

export const SCENE_LM_HEAD: Scene<PipelineState, PipelineState> = {
    id: 'lm-head',
    durationMs: 3000,
    render: (t, state) => {
        const inputs = sourceInputs(state);
        const vocabSize = effectiveVocabSize(state);
        const last = inputs[inputs.length - 1] ?? [];
        const logits = state.logits ?? synthesizeLogits(last, vocabSize, LOGITS_SCENE_SEED).values;
        return (
            <LMHeadScene
                t={t}
                tokens={state.tokens}
                inputs={inputs}
                vocabSize={vocabSize}
                logits={logits}
            />
        );
    },
    transform: (state) => {
        if (state.logits) return state;
        const inputs = sourceInputs(state);
        if (inputs.length === 0) return state;
        const last = inputs[inputs.length - 1] ?? [];
        const vocabSize = effectiveVocabSize(state);
        const { values } = synthesizeLogits(last, vocabSize, LOGITS_SCENE_SEED);
        return { ...state, logits: values, vocabSize };
    },
};

export default LMHeadScene;
