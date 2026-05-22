import { useMemo } from 'react';
import VectorStrip from '@/Components/Viz/VectorStrip';
import { syntheticEmbedding, layerNormalize } from '@/lib/syntheticEmbedding';
import { blendValues, generateMultiHeadMatrices, splitQKV } from '@/lib/syntheticAttention';
import { viridisAt, normalize } from '@/lib/vizColors';
import { VISIBLE_EMBEDDING_DIM, type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 8 — Multi-head self-attention (M13 chunk 5).
 *
 * The centerpiece of the cinematic pipeline. Three phased sub-beats
 * inside a single ~6.5s scene (per `docs/visualization.md` and
 * `phase1.md` chunk-5 spec):
 *
 *   8a (t = 0.000 .. 0.231): Q/K/V budding — from each input
 *       strip (the layer-normed vector from Scene 7), three new
 *       strips fade in color-coded Q (cyan), K (orange), V (emerald),
 *       arranged in three parallel rows.
 *
 *   8b (t = 0.231 .. 0.692): N×N attention matrix materializes;
 *       fans out into a representative multi-head stack (6 of M
 *       per the chunk-5 design decision) then collapses back; a
 *       row-by-row softmax wave sweeps top-down highlighting each
 *       query's attention row.
 *
 *   8c (t = 0.692 .. 1.000): V-vector blend — output strips
 *       materialize with per-cell colors derived from the
 *       attention-weighted V sum.
 *
 * Cross-fade between sub-beats: ±5% of total t around each phase
 * boundary, so the layout shift between rows ↔ matrix ↔ output
 * reads as a deliberate beat instead of a jump cut.
 *
 * Determinism: every visual value here is a pure function of
 * `(tokenIndex, headIndex, layerIndex=0)`. `runId` enters in
 * chunk 10 when the WebSocket event stream wires up; until then
 * the seed scope is documented in the chunk-5 decisions block.
 */

const PHASE_8A_END = 0.231; // 1500 / 6500
const PHASE_8B_END = 0.692; // (1500 + 3000) / 6500
const CROSSFADE = 0.05;
const REPRESENTATIVE_HEAD_COUNT = 6;
const DEFAULT_TOTAL_HEADS = 32;

interface AttentionSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    embeddings: readonly (readonly number[])[];
    headMatrices: number[][][];
}

function AttentionScene({ t, tokens, embeddings, headMatrices }: AttentionSceneProps) {
    const tokenList = tokens ?? [];

    // Per-phase opacities. The first phase (8a) is full-on at t=0
    // and fades out across the 8a→8b boundary; 8b fades in/out at
    // both boundaries; the last phase (8c) fades in at the 8b→8c
    // boundary and stays full-on through t=1.
    const phase8a = leadingPhaseOpacity(t, PHASE_8A_END);
    const phase8b = middlePhaseOpacity(t, PHASE_8A_END, PHASE_8B_END);
    const phase8c = trailingPhaseOpacity(t, PHASE_8B_END);

    // Q/K/V derived from the layer-normed input. Memoized so the
    // sign-flip masks don't re-run per render frame.
    const qkv = useMemo(() => embeddings.map((emb, i) => splitQKV(emb, i, 0)), [embeddings]);

    // Representative attention matrix (head 0) used in 8b collapse
    // view and 8c V-blend.
    const representativeMatrix = headMatrices[0] ?? [];

    // V-blended output (head 0). Memoized — same dependencies as qkv.
    const attentionOutput = useMemo(() => {
        if (qkv.length === 0 || representativeMatrix.length === 0) return [];
        return blendValues(
            qkv.map((kvq) => kvq.v),
            representativeMatrix,
        );
    }, [qkv, representativeMatrix]);

    // 8b multi-head fan: bell curve peaks mid-phase, narrow window.
    const tIn8b = clamp((t - PHASE_8A_END) / (PHASE_8B_END - PHASE_8A_END), 0, 1);
    const fanOpenAmount = bell(tIn8b, 0.5, 0.25);

    // 8b softmax wave row index (0..N): travels top-down across 8b.
    const softmaxRow = tIn8b * Math.max(tokenList.length, 1);

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-8-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-8-caption"
            >
                Scene 8 · Multi-head self-attention
            </p>

            {phase8a > 0 && (
                <QKVRows
                    opacity={phase8a}
                    qkv={qkv}
                    tokenStrings={tokenList.map((tok) => tok.string)}
                />
            )}

            {phase8b > 0 && (
                <MultiHeadView
                    opacity={phase8b}
                    matrices={headMatrices}
                    fanOpenAmount={fanOpenAmount}
                    softmaxRow={softmaxRow}
                    totalHeads={DEFAULT_TOTAL_HEADS}
                />
            )}

            {phase8c > 0 && (
                <OutputBlend
                    opacity={phase8c}
                    attentionOutput={attentionOutput}
                    attentionMatrix={representativeMatrix}
                    tokenStrings={tokenList.map((tok) => tok.string)}
                />
            )}
        </div>
    );
}

interface QKVRowsProps {
    opacity: number;
    qkv: readonly { q: readonly number[]; k: readonly number[]; v: readonly number[] }[];
    tokenStrings: string[];
}

function QKVRows({ opacity, qkv, tokenStrings }: QKVRowsProps) {
    return (
        <div className="flex w-full flex-col gap-2" style={{ opacity }} data-testid="scene-8a-qkv">
            {(['q', 'k', 'v'] as const).map((role) => (
                <div
                    key={role}
                    className="flex items-center gap-2"
                    data-testid={`scene-8a-row-${role}`}
                >
                    <span
                        className={`w-7 rounded px-1 py-0.5 text-center text-[9px] font-mono font-semibold uppercase tabular-nums ${ROLE_BADGE_CLASS[role]}`}
                    >
                        {role.toUpperCase()}
                    </span>
                    <div className="flex flex-wrap gap-1">
                        {qkv.slice(0, 8).map((triple, i) => (
                            <div
                                key={i}
                                className="flex flex-col items-center"
                                data-testid={`scene-8a-cell-${role}-${i}`}
                            >
                                <VectorStrip
                                    values={triple[role]}
                                    visibleCells={Math.min(64, triple[role].length)}
                                    totalLength={4096}
                                    width={90}
                                    height={10}
                                />
                                <span className="mt-0.5 max-w-[60px] truncate text-[8px] text-muted-foreground/70">
                                    {tokenStrings[i] === ' ' ? '·' : tokenStrings[i]}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
            <p className="mt-1 text-center text-[9px] italic text-muted-foreground/70">
                Each input embedding projects to three vectors per head: query
                <span className="mx-1 text-cyan-400">(Q)</span>, key
                <span className="mx-1 text-orange-400">(K)</span>, and value
                <span className="mx-1 text-emerald-400">(V)</span>.
            </p>
        </div>
    );
}

const ROLE_BADGE_CLASS = {
    q: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
    k: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
    v: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
} as const;

interface MultiHeadViewProps {
    opacity: number;
    matrices: number[][][];
    fanOpenAmount: number;
    softmaxRow: number;
    totalHeads: number;
}

function MultiHeadView({
    opacity,
    matrices,
    fanOpenAmount,
    softmaxRow,
    totalHeads,
}: MultiHeadViewProps) {
    const n = matrices[0]?.length ?? 0;
    if (n === 0) return null;

    // When fan is closed (0), show one centered matrix. When fully
    // open (1), spread `matrices.length` matrices horizontally with
    // slight Y-stagger so the parallel-heads metaphor reads. Cross-
    // fades use the same fanOpenAmount as the spatial spread.
    const heads = matrices.length;
    const matSize = 140 - fanOpenAmount * 50; // shrinks slightly when fanned

    return (
        <div
            className="flex flex-col items-center gap-1"
            style={{ opacity }}
            data-testid="scene-8b-multihead"
        >
            <div
                className="relative flex items-center justify-center"
                style={{ minHeight: 160, width: 480 }}
            >
                {matrices.map((matrix, h) => {
                    // Spread heads evenly when fanned; stack at center when collapsed.
                    const center = (heads - 1) / 2;
                    const xOffset = (h - center) * fanOpenAmount * 60;
                    const yOffset = Math.abs(h - center) * fanOpenAmount * 8;
                    const headOpacity = h === 0 ? 1 : 0.35 + 0.6 * fanOpenAmount;
                    return (
                        <div
                            key={h}
                            className="absolute"
                            style={{
                                transform: `translate(${xOffset}px, ${yOffset}px)`,
                                opacity: headOpacity,
                                zIndex: heads - Math.abs(h - center),
                            }}
                            data-testid={`scene-8b-head-${h}`}
                        >
                            <MiniMatrix
                                matrix={matrix}
                                size={matSize}
                                softmaxRow={h === 0 ? softmaxRow : -1}
                            />
                        </div>
                    );
                })}
            </div>
            <p
                className="text-[9px] font-mono text-muted-foreground"
                data-testid="scene-8b-head-caption"
            >
                Attention · showing {heads} of {totalHeads} heads
            </p>
            <p className="max-w-md text-center text-[9px] italic text-muted-foreground/70">
                Each head computes its own causal attention pattern over the sequence. Rows
                softmax-normalize so each query&apos;s weights sum to 1; the upper triangle stays
                masked.
            </p>
        </div>
    );
}

interface MiniMatrixProps {
    matrix: number[][];
    size: number;
    /** Row index currently being swept by the softmax wave (-1 = none). */
    softmaxRow: number;
}

function MiniMatrix({ matrix, size, softmaxRow }: MiniMatrixProps) {
    const n = matrix.length;
    if (n === 0) return null;
    const cell = size / n;
    const max = Math.max(1e-6, ...matrix.flat().map((v) => v));

    return (
        <svg
            width={size}
            height={size}
            className="rounded-sm border border-border bg-slate-950"
            role="img"
            aria-label="Attention matrix (illustrative)"
            data-testid="scene-8b-mini-matrix"
        >
            {matrix.map((row, i) => {
                const isActive =
                    softmaxRow >= 0 && i <= Math.floor(softmaxRow) && i >= softmaxRow - 1;
                return row.map((v, j) => (
                    <rect
                        key={`${i}-${j}`}
                        x={j * cell}
                        y={i * cell}
                        width={cell + 0.5}
                        height={cell + 0.5}
                        fill={v === 0 ? '#0f172a' : viridisAt(v / max)}
                        opacity={isActive ? 1 : 0.75}
                    />
                ));
            })}
            {softmaxRow >= 0 && softmaxRow < n && (
                <line
                    x1={0}
                    y1={(Math.floor(softmaxRow) + 0.5) * cell}
                    x2={size}
                    y2={(Math.floor(softmaxRow) + 0.5) * cell}
                    stroke="#fbbf24"
                    strokeWidth={0.8}
                    opacity={0.65}
                    data-testid="scene-8b-softmax-wave"
                />
            )}
        </svg>
    );
}

interface OutputBlendProps {
    opacity: number;
    attentionOutput: readonly (readonly number[])[];
    attentionMatrix: readonly (readonly number[])[];
    tokenStrings: string[];
}

function OutputBlend({
    opacity,
    attentionOutput,
    attentionMatrix,
    tokenStrings,
}: OutputBlendProps) {
    return (
        <div
            className="flex w-full flex-col items-center gap-1"
            style={{ opacity }}
            data-testid="scene-8c-output"
        >
            <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
                Output · weighted V sum
            </p>
            <div className="flex flex-col gap-1">
                {attentionOutput.slice(0, 8).map((row, i) => {
                    const attentionRow = attentionMatrix[i] ?? [];
                    const normedRow = normalize([...row]);
                    return (
                        <div
                            key={i}
                            className="flex items-center gap-2"
                            data-testid={`scene-8c-row-${i}`}
                        >
                            <span className="w-6 rounded bg-card/60 px-1 py-0.5 text-center text-[9px] tabular-nums text-muted-foreground">
                                {i}
                            </span>

                            {/* Attention-weight "pull-in" dots for the first 3 positions. */}
                            {i < 3 && (
                                <div className="flex items-center gap-0.5">
                                    {attentionRow.slice(0, i + 1).map((w, j) => (
                                        <div
                                            key={j}
                                            className="h-2 w-2 rounded-full bg-emerald-400"
                                            style={{ opacity: Math.min(1, w * 3) }}
                                            data-testid={`scene-8c-pull-${i}-${j}`}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Output strip rendered with viridis from the normed row. */}
                            <svg
                                width={220}
                                height={12}
                                aria-hidden="true"
                                data-testid={`scene-8c-strip-${i}`}
                            >
                                {normedRow.slice(0, 96).map((v, k) => {
                                    const cellWidth = 220 / Math.min(96, normedRow.length);
                                    return (
                                        <rect
                                            key={k}
                                            x={k * cellWidth}
                                            y={0}
                                            width={cellWidth + 0.5}
                                            height={12}
                                            fill={viridisAt(v)}
                                        />
                                    );
                                })}
                            </svg>

                            <span className="max-w-[60px] truncate text-[9px] text-muted-foreground/70">
                                {tokenStrings[i] === ' ' ? '·' : tokenStrings[i]}
                            </span>
                        </div>
                    );
                })}
            </div>
            <p className="max-w-md text-center text-[9px] italic text-muted-foreground/70">
                Each output is a weighted sum of every V vector, blended by the row of the attention
                matrix. Later positions can attend to more of the sequence.
            </p>
        </div>
    );
}

/**
 * First-phase opacity: full-on at t=0, fades out across the
 * [end - CROSSFADE, end + CROSSFADE] boundary, zero after.
 */
function leadingPhaseOpacity(t: number, end: number): number {
    if (t <= end - CROSSFADE) return 1;
    if (t >= end + CROSSFADE) return 0;
    return clamp(1 - (t - (end - CROSSFADE)) / (2 * CROSSFADE), 0, 1);
}

/**
 * Middle-phase opacity: zero before start, fades in across
 * [start - CROSSFADE, start + CROSSFADE], holds, fades out across
 * [end - CROSSFADE, end + CROSSFADE], zero after.
 */
function middlePhaseOpacity(t: number, start: number, end: number): number {
    if (t <= start - CROSSFADE) return 0;
    if (t >= end + CROSSFADE) return 0;
    if (t < start + CROSSFADE) return clamp((t - (start - CROSSFADE)) / (2 * CROSSFADE), 0, 1);
    if (t > end - CROSSFADE) return clamp(1 - (t - (end - CROSSFADE)) / (2 * CROSSFADE), 0, 1);
    return 1;
}

/**
 * Trailing-phase opacity: zero before start, fades in across the
 * [start - CROSSFADE, start + CROSSFADE] boundary, full-on through
 * t=1.
 */
function trailingPhaseOpacity(t: number, start: number): number {
    if (t <= start - CROSSFADE) return 0;
    if (t >= start + CROSSFADE) return 1;
    return clamp((t - (start - CROSSFADE)) / (2 * CROSSFADE), 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/** Bell-curve in [0, 1] peaking at `center` with falloff width `width`. */
function bell(x: number, center: number, width: number): number {
    const d = (x - center) / width;
    return Math.max(0, Math.exp(-d * d));
}

/** Helper for the scene's transform() + render() to ensure embeddings exist. */
function embeddingsFor(state: PipelineState): readonly (readonly number[])[] {
    if (state.layerNormed) return state.layerNormed;
    if (state.positionEncoded) return state.positionEncoded;
    if (state.embeddings) return state.embeddings;
    if (state.tokens) {
        return state.tokens.map((tok) =>
            layerNormalize(syntheticEmbedding(tok.id, VISIBLE_EMBEDDING_DIM)),
        );
    }
    return [];
}

export const SCENE_ATTENTION: Scene<PipelineState, PipelineState> = {
    id: 'attention',
    durationMs: 6500,
    render: (t, state) => {
        const embeddings = embeddingsFor(state);
        const headMatrices =
            state.attentionHeadMatrices?.map((m) => m.map((row) => [...row])) ??
            generateMultiHeadMatrices(embeddings.length, REPRESENTATIVE_HEAD_COUNT, 0);
        return (
            <AttentionScene
                t={t}
                tokens={state.tokens}
                embeddings={embeddings}
                headMatrices={headMatrices}
            />
        );
    },
    transform: (state) => {
        if (
            state.qkv &&
            state.attentionHeadMatrices &&
            state.attentionScores &&
            state.attentionOutput
        ) {
            return state;
        }
        const embeddings = embeddingsFor(state);
        if (embeddings.length === 0) return state;
        const qkv = embeddings.map((emb, i) => splitQKV(emb, i, 0));
        const attentionHeadMatrices = generateMultiHeadMatrices(
            embeddings.length,
            REPRESENTATIVE_HEAD_COUNT,
            0,
        );
        const attentionScores = attentionHeadMatrices[0] ?? [];
        const attentionOutput = blendValues(
            qkv.map((kvq) => kvq.v),
            attentionScores,
        );
        return {
            ...state,
            qkv,
            attentionHeadMatrices,
            attentionScores,
            attentionOutput,
        };
    },
};

export default AttentionScene;
