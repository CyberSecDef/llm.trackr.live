import TokenPill from '@/Components/Viz/TokenPill';
import VectorStrip from '@/Components/Viz/VectorStrip';
import WeightFog from '@/Components/Viz/WeightFog';
import { syntheticEmbedding } from '@/lib/syntheticEmbedding';
import { VISIBLE_EMBEDDING_DIM, type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 5 — Embedding lookup (M13 chunk 4b).
 *
 * Per `docs/visualization.md`: "Camera dramatically zooms out…
 * The token row shrinks to the bottom of the screen. Above it, a
 * massive matrix materializes — show it as a wireframe grid
 * labeled 'Embedding table: 128,000 × 4096.' Make it visually
 * overwhelming; this is the first 'wow this is big' moment."
 *
 * Per-token beams shoot up to specific rows of the matrix; the
 * matched row "lights up, detaches, and slides down to replace
 * the token pill" — emerging as a horizontal vector strip.
 *
 * Phases within t:
 *   0.00 - 0.30 : matrix materializes (WeightFog fades in,
 *                 caption + dimensions reveal)
 *   0.30 - 0.70 : per-token beams shoot upward from each pill to
 *                 a row in the matrix (staggered)
 *   0.50 - 1.00 : matrix rows detach and slide down to replace
 *                 the pills as VectorStrips
 *
 * The fake matrix is rendered as a WeightFog patch with the
 * label overlaid — visually overwhelming without trying to draw
 * 128,000 × 4096 actual cells. The "rows light up" effect is
 * faked: we draw 8-12 horizontal accent lines at random Y
 * positions inside the fog.
 *
 * Output state: embeddings (one synthetic 128-dim vector per
 * token; the real dim communicated via the totalLength prop).
 */

const VOCAB_LABEL = '128,000 × 4096';

interface EmbeddingLookupSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    embeddings: readonly (readonly number[])[];
}

function EmbeddingLookupScene({ t, tokens, embeddings }: EmbeddingLookupSceneProps) {
    const matrixOpacity = Math.min(t / 0.3, 1);
    // Beam phase: tokens start lighting up beams in series
    const beamPhase = Math.max(0, Math.min((t - 0.3) / 0.4, 1));
    // Detach phase: rows start falling at 0.5, fully replaced at 1.0
    const detachPhase = Math.max(0, Math.min((t - 0.5) / 0.5, 1));

    const tokenList = tokens ?? [];

    return (
        <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-3">
            <p
                className="text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-5-caption"
            >
                Scene 5 · Embedding lookup
            </p>

            {/* Top region: matrix + dimensions */}
            <div
                className="relative flex h-48 w-full items-center justify-center"
                style={{ opacity: matrixOpacity }}
                data-testid="scene-5-matrix-region"
            >
                <WeightFog
                    width={520}
                    height={170}
                    density={8}
                    className="absolute inset-0 mx-auto"
                />
                {/* Horizontal accent lines simulating "matrix rows" */}
                <svg
                    width={520}
                    height={170}
                    className="absolute inset-0 mx-auto"
                    aria-hidden="true"
                >
                    {Array.from({ length: 14 }, (_, i) => {
                        const y = 12 + i * 11;
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
                </svg>
                <div className="relative z-10 rounded-md border border-border bg-card/80 px-3 py-1.5 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Embedding table
                    </p>
                    <p className="font-mono text-sm font-semibold text-foreground">{VOCAB_LABEL}</p>
                    <p className="text-[9px] text-muted-foreground/70 italic">vocab × hidden dim</p>
                </div>
            </div>

            {/* Beams shooting up — one line per token */}
            <svg
                width="100%"
                height={48}
                className="block"
                aria-hidden="true"
                data-testid="scene-5-beams"
            >
                {tokenList.map((_, i) => {
                    const tokenCount = tokenList.length;
                    const xPct = ((i + 0.5) / Math.max(tokenCount, 1)) * 100;
                    // Per-token beam launches staggered across beamPhase
                    const localPhase = Math.max(0, Math.min((beamPhase * tokenCount - i) / 1, 1));
                    return (
                        <line
                            key={i}
                            x1={`${xPct}%`}
                            y1={48}
                            x2={`${xPct}%`}
                            y2={48 - localPhase * 48}
                            stroke="#67e8f9"
                            strokeWidth={1}
                            opacity={localPhase * 0.7}
                        />
                    );
                })}
            </svg>

            {/* Bottom region: tokens at first, replaced by vector strips */}
            <div
                className="flex flex-wrap items-center justify-center gap-1"
                data-testid="scene-5-bottom-row"
            >
                {tokenList.map((tok, i) => {
                    const emb = embeddings[i] ?? [];
                    // Per-token: at detachPhase < 0.5 show TokenPill, else show VectorStrip
                    const localPhase = Math.max(
                        0,
                        Math.min(detachPhase * 1.5 - i / Math.max(tokenList.length, 1), 1),
                    );
                    const asStrip = localPhase >= 0.5;
                    return asStrip ? (
                        <div
                            key={i}
                            style={{ opacity: localPhase }}
                            data-testid={`scene-5-strip-${i}`}
                        >
                            <VectorStrip
                                values={emb}
                                visibleCells={Math.min(64, emb.length)}
                                totalLength={4096}
                                width={120}
                                height={12}
                            />
                        </div>
                    ) : (
                        <div
                            key={i}
                            style={{ opacity: 1 - localPhase }}
                            data-testid={`scene-5-pill-${i}`}
                        >
                            <TokenPill tokenId={tok.id} label={tok.string} size="sm" />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const SCENE_EMBEDDING_LOOKUP: Scene<PipelineState, PipelineState> = {
    id: 'embedding-lookup',
    durationMs: 3000,
    render: (t, state) => {
        const embeddings =
            state.embeddings ??
            (state.tokens
                ? state.tokens.map((tok) => syntheticEmbedding(tok.id, VISIBLE_EMBEDDING_DIM))
                : []);
        return <EmbeddingLookupScene t={t} tokens={state.tokens} embeddings={embeddings} />;
    },
    transform: (state) => {
        if (state.embeddings) return state;
        if (!state.tokens) return state;
        const embeddings = state.tokens.map((tok) =>
            syntheticEmbedding(tok.id, VISIBLE_EMBEDDING_DIM),
        );
        return { ...state, embeddings };
    },
};

export default EmbeddingLookupScene;
