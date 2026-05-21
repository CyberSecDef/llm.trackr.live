import { viridisAt, normalize } from '@/lib/vizColors';
import { layerNormalize, lerpVector, syntheticEmbedding } from '@/lib/syntheticEmbedding';
import { VISIBLE_EMBEDDING_DIM, type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 7 — Layer norm (M13 chunk 4b).
 *
 * Per `docs/visualization.md`: "Vector strips temporarily render
 * as bar charts (heights = values). The bars have wildly varying
 * heights. A horizontal 'squish' animation compresses outliers
 * and equalizes the distribution — visually it looks like the
 * bars all snap toward a similar height range. Snap back to
 * heatmap strip view."
 *
 * Implementation: t-driven crossfade of two visual modes (bar
 * chart vs heatmap strip) combined with a value-domain mix
 * between raw vector and layer-normed vector.
 *
 * Phases within t:
 *   0.00 - 0.15 : strips morph into bar charts (raw values, varied)
 *   0.15 - 0.65 : "squish" — values lerp toward layer-normed
 *                 distribution, bars equalize
 *   0.65 - 1.00 : bars morph back into heatmap strips, now
 *                 colored by normalized values
 *
 * Renders bars + strips as inline SVG so we can crossfade between
 * them with a single opacity prop pair, avoiding layout shift.
 *
 * Output state: layerNormed — one normalized vector per token.
 */

const STRIP_WIDTH = 280;
const STRIP_HEIGHT = 28;

interface LayerNormSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    inputs: readonly (readonly number[])[];
}

function LayerNormScene({ t, tokens, inputs }: LayerNormSceneProps) {
    // Phase 0..0.15: bars appear; opacity ramps 0→1
    const barsOpacity = Math.min(t / 0.15, 1);
    // Phase 0.65..1: strips reappear; opacity ramps 0→1
    const stripOpacity = Math.max(0, Math.min((t - 0.65) / 0.35, 1));
    // Value-domain mix: raw at t<0.15, fully normalized by t>=0.65
    const valueMix = Math.max(0, Math.min((t - 0.15) / 0.5, 1));

    const tokenList = tokens ?? [];

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3">
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-7-caption"
            >
                Scene 7 · Layer norm
            </p>

            <div className="flex w-full flex-col items-center gap-1" data-testid="scene-7-rows">
                {tokenList.slice(0, 8).map((tok, i) => {
                    const raw = inputs[i] ?? [];
                    const normed = raw.length > 0 ? layerNormalize(raw) : [];
                    const blended = lerpVector(raw, normed, valueMix);

                    return (
                        <div
                            key={i}
                            className="flex items-center gap-2 font-mono"
                            data-testid={`scene-7-row-${i}`}
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
                                {/* Bar-chart layer (raw heights → squished) */}
                                <BarChart
                                    values={blended}
                                    width={STRIP_WIDTH}
                                    height={STRIP_HEIGHT}
                                    opacity={barsOpacity - stripOpacity * 0.7}
                                />
                                {/* Strip layer (heatmap, fades in after squish) */}
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

            <p className="max-w-md text-center text-[10px] text-muted-foreground/70 italic">
                Layer norm subtracts the mean and divides by the standard deviation, equalizing the
                value distribution across the hidden dimension. Outliers are pulled in.
            </p>
        </div>
    );
}

interface BarChartProps {
    values: readonly number[];
    width: number;
    height: number;
    opacity: number;
}

function BarChart({ values, width, height, opacity }: BarChartProps) {
    if (values.length === 0 || opacity <= 0) return null;
    const visible = values.slice(0, 96);
    const barWidth = width / visible.length;
    // Map [-1, 1]ish to bar heights
    const maxAbs = Math.max(1e-6, ...visible.map(Math.abs));
    return (
        <svg
            className="absolute inset-0"
            width={width}
            height={height}
            style={{ opacity: Math.max(0, Math.min(1, opacity)) }}
            aria-hidden="true"
            data-testid="scene-7-barchart"
        >
            {visible.map((v, i) => {
                const h = (Math.abs(v) / maxAbs) * (height * 0.9);
                const y = v >= 0 ? height / 2 - h : height / 2;
                return (
                    <rect
                        key={i}
                        x={i * barWidth}
                        y={y}
                        width={Math.max(0.8, barWidth - 0.5)}
                        height={Math.max(0.5, h)}
                        fill={v >= 0 ? '#67e8f9' : '#fbbf24'}
                        opacity={0.85}
                    />
                );
            })}
            {/* Centerline */}
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

interface HeatStripProps {
    values: readonly number[];
    width: number;
    height: number;
    opacity: number;
}

function HeatStrip({ values, width, height, opacity }: HeatStripProps) {
    if (values.length === 0 || opacity <= 0) return null;
    const visible = values.slice(0, 96);
    const normalized = normalize(visible);
    const cellWidth = width / visible.length;
    return (
        <svg
            className="absolute inset-0"
            width={width}
            height={height}
            style={{ opacity: Math.max(0, Math.min(1, opacity)) }}
            aria-hidden="true"
            data-testid="scene-7-heatstrip"
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

export const SCENE_LAYER_NORM: Scene<PipelineState, PipelineState> = {
    id: 'layer-norm',
    durationMs: 2200,
    render: (t, state) => {
        const inputs =
            state.positionEncoded ??
            state.embeddings ??
            (state.tokens
                ? state.tokens.map((tok) => syntheticEmbedding(tok.id, VISIBLE_EMBEDDING_DIM))
                : []);
        return <LayerNormScene t={t} tokens={state.tokens} inputs={inputs} />;
    },
    transform: (state) => {
        if (state.layerNormed) return state;
        const inputs = state.positionEncoded ?? state.embeddings;
        if (!inputs) return state;
        const layerNormed = inputs.map((v) => layerNormalize(v));
        return { ...state, layerNormed };
    },
};

export default LayerNormScene;
