import { viridisAt, normalize } from '@/lib/vizColors';
import { layerNormalize, lerpVector, syntheticEmbedding } from '@/lib/syntheticEmbedding';
import { VISIBLE_EMBEDDING_DIM, type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 13 — Final layer norm (M13 chunk 8a).
 *
 * Per `docs/visualization.md:108-110`: "Same squish animation as
 * Scene 7, briefer." Halved duration (500ms vs Scene 7's 2200ms)
 * but identical bar-chart → squish → heat-strip morph, applied to
 * `residualOutput2` (the layer-stack output) before the LM head.
 *
 * Kept as its own file (vs. refactoring Scene 7 into a factory)
 * so the chunk-4 implementation stays untouched. The factory
 * pattern from `ResidualScene` would have worked too — judgment
 * call recorded in the chunk-8a decisions block.
 *
 * Phases within t:
 *   0.00 - 0.15 : bar chart fades in (raw values, varied)
 *   0.15 - 0.65 : squish — values lerp toward normalized
 *   0.65 - 1.00 : heat strip morphs back
 *
 * Output state: `finalNormed` — mean-0/variance-1 vectors that
 * feed Scene 14's LM head projection.
 */

const STRIP_WIDTH = 260;
const STRIP_HEIGHT = 22;
const ROW_CAP = 6;

interface FinalNormSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    inputs: readonly (readonly number[])[];
}

function FinalNormScene({ t, tokens, inputs }: FinalNormSceneProps) {
    const barsOpacity = Math.min(t / 0.15, 1);
    const stripOpacity = Math.max(0, Math.min((t - 0.65) / 0.35, 1));
    const valueMix = Math.max(0, Math.min((t - 0.15) / 0.5, 1));

    const tokenList = tokens ?? [];

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-13-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-13-caption"
            >
                Scene 13 · Final layer norm
            </p>

            <div className="flex w-full flex-col items-center gap-1" data-testid="scene-13-rows">
                {tokenList.slice(0, ROW_CAP).map((tok, i) => {
                    const raw = inputs[i] ?? [];
                    const normed = raw.length > 0 ? layerNormalize(raw) : [];
                    const blended = lerpVector(raw, normed, valueMix);
                    return (
                        <div
                            key={i}
                            className="flex items-center gap-2 font-mono"
                            data-testid={`scene-13-row-${i}`}
                        >
                            <span className="w-6 rounded bg-card/60 px-1 py-0.5 text-center text-[9px] tabular-nums text-muted-foreground">
                                {i}
                            </span>
                            <div
                                className="relative"
                                style={{
                                    width: STRIP_WIDTH,
                                    height: STRIP_HEIGHT,
                                }}
                            >
                                <BarChart
                                    values={blended}
                                    width={STRIP_WIDTH}
                                    height={STRIP_HEIGHT}
                                    opacity={barsOpacity - stripOpacity * 0.7}
                                />
                                <HeatStrip
                                    values={blended}
                                    width={STRIP_WIDTH}
                                    height={STRIP_HEIGHT}
                                    opacity={stripOpacity}
                                />
                            </div>
                            <span
                                className="max-w-[60px] truncate text-[9px] text-muted-foreground/70"
                                title={tok.string}
                            >
                                {tok.string === ' ' ? '·' : tok.string}
                            </span>
                        </div>
                    );
                })}
            </div>

            <p className="max-w-md text-center text-[9px] italic text-muted-foreground/70">
                One last layer-norm before the LM head — equalizes the value distribution so the
                projection lands in a well-conditioned range.
            </p>
        </div>
    );
}

interface StripPanelProps {
    values: readonly number[];
    width: number;
    height: number;
    opacity: number;
}

function BarChart({ values, width, height, opacity }: StripPanelProps) {
    if (values.length === 0 || opacity <= 0) return null;
    const visible = values.slice(0, 80);
    const barWidth = width / visible.length;
    const maxAbs = Math.max(1e-6, ...visible.map(Math.abs));
    return (
        <svg
            className="absolute inset-0"
            width={width}
            height={height}
            style={{ opacity: Math.max(0, Math.min(1, opacity)) }}
            aria-hidden="true"
            data-testid="scene-13-barchart"
        >
            {visible.map((v, i) => {
                const h = (Math.abs(v) / maxAbs) * (height * 0.9);
                const y = v >= 0 ? height / 2 - h : height / 2;
                return (
                    <rect
                        key={i}
                        x={i * barWidth}
                        y={y}
                        width={Math.max(0.8, barWidth - 0.4)}
                        height={Math.max(0.5, h)}
                        fill={v >= 0 ? '#67e8f9' : '#fbbf24'}
                        opacity={0.85}
                    />
                );
            })}
            <line
                x1={0}
                y1={height / 2}
                x2={width}
                y2={height / 2}
                stroke="#475569"
                strokeWidth={0.5}
                opacity={0.6}
            />
        </svg>
    );
}

function HeatStrip({ values, width, height, opacity }: StripPanelProps) {
    if (values.length === 0 || opacity <= 0) return null;
    const visible = values.slice(0, 80);
    const normalized = normalize(visible);
    const cellWidth = width / visible.length;
    return (
        <svg
            className="absolute inset-0"
            width={width}
            height={height}
            style={{ opacity: Math.max(0, Math.min(1, opacity)) }}
            aria-hidden="true"
            data-testid="scene-13-heatstrip"
        >
            {normalized.map((v, i) => (
                <rect
                    key={i}
                    x={i * cellWidth}
                    y={0}
                    width={cellWidth + 0.5}
                    height={height}
                    fill={viridisAt(v)}
                />
            ))}
        </svg>
    );
}

function sourceInputs(state: PipelineState): readonly (readonly number[])[] {
    return (
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

export const SCENE_FINAL_NORM: Scene<PipelineState, PipelineState> = {
    id: 'final-norm',
    durationMs: 500,
    render: (t, state) => {
        const inputs = sourceInputs(state);
        return <FinalNormScene t={t} tokens={state.tokens} inputs={inputs} />;
    },
    transform: (state) => {
        if (state.finalNormed) return state;
        const inputs = sourceInputs(state);
        if (inputs.length === 0) return state;
        const finalNormed = inputs.map((v) => layerNormalize(v));
        return { ...state, finalNormed };
    },
};

export default FinalNormScene;
