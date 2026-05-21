import VectorStrip from '@/Components/Viz/VectorStrip';
import { applyPositionRotation, syntheticEmbedding } from '@/lib/syntheticEmbedding';
import { VISIBLE_EMBEDDING_DIM, type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 6 — Positional encoding / RoPE (M13 chunk 4b).
 *
 * Per `docs/visualization.md`: "A small position counter (0, 1, 2,
 * 3…) appears above each vector strip. Then a rotation animation:
 * each strip visibly 'twists' — you can render this as a subtle
 * wave/shear across the cells, or as the strip rotating in 3D
 * around its long axis, with the rotation amount proportional to
 * position index. Brief 'rotation angle' annotation for the first
 * few. The colors shift slightly post-rotation."
 *
 * Implementation: t-driven mix of raw embedding ↔ position-rotated
 * embedding. The rotation comes from `applyPositionRotation()`
 * which pair-rotates adjacent dimensions by an angle proportional
 * to the position index — visible to the user as a position-
 * dependent color shift across the strip.
 *
 * Phases within t:
 *   0.0 - 0.2 : position counters fade in above each strip
 *   0.2 - 0.8 : rotation mix ramps 0 → 1 (vectors twist)
 *   0.8 - 1.0 : θ annotation for the first 3 strips fades in
 *
 * Output state: positionEncoded — one vector per token, post-RoPE.
 */

interface PositionalEncodingSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    embeddings: readonly (readonly number[])[];
}

function PositionalEncodingScene({ t, tokens, embeddings }: PositionalEncodingSceneProps) {
    const counterOpacity = Math.min(t / 0.2, 1);
    const rotationMix = Math.max(0, Math.min((t - 0.2) / 0.6, 1));
    const thetaOpacity = Math.max(0, Math.min((t - 0.8) / 0.2, 1));

    const tokenList = tokens ?? [];

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden p-3">
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-6-caption"
            >
                Scene 6 · Positional encoding (RoPE)
            </p>

            <div className="flex w-full flex-col items-center gap-2" data-testid="scene-6-rows">
                {tokenList.map((tok, i) => {
                    const rawEmb = embeddings[i] ?? [];
                    const rotated = applyPositionRotation(rawEmb, i, rotationMix);
                    const angle = ((i * Math.PI) / 16) * rotationMix;
                    return (
                        <div
                            key={i}
                            className="flex items-center gap-2 font-mono"
                            data-testid={`scene-6-row-${i}`}
                        >
                            {/* Position counter */}
                            <span
                                className="w-6 rounded bg-card/60 px-1 py-0.5 text-center text-[9px] tabular-nums text-muted-foreground"
                                style={{ opacity: counterOpacity }}
                                data-testid={`scene-6-pos-${i}`}
                            >
                                {i}
                            </span>

                            <VectorStrip
                                values={rotated}
                                visibleCells={Math.min(96, rotated.length)}
                                totalLength={4096}
                                width={220}
                                height={12}
                            />

                            {/* Token label (kept small so the strip is the focus) */}
                            <span
                                className="max-w-[60px] truncate text-[9px] text-muted-foreground/70"
                                title={tok.string}
                            >
                                {tok.string === ' ' ? '·' : tok.string}
                            </span>

                            {/* θ annotation — first 3 rows only */}
                            {i < 3 && (
                                <span
                                    className="text-[9px] tabular-nums text-cyan-400/80"
                                    style={{ opacity: thetaOpacity }}
                                    data-testid={`scene-6-theta-${i}`}
                                >
                                    θ ≈ {angle.toFixed(2)}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="max-w-md text-center text-[10px] text-muted-foreground/70 italic">
                Position information is folded into each embedding by rotating pairs of dimensions
                by an angle proportional to the token&apos;s position. Same word at different
                positions → different vectors.
            </p>
        </div>
    );
}

export const SCENE_POSITIONAL_ENCODING: Scene<PipelineState, PipelineState> = {
    id: 'positional-encoding',
    durationMs: 2500,
    render: (t, state) => {
        const embeddings =
            state.embeddings ??
            (state.tokens
                ? state.tokens.map((tok) => syntheticEmbedding(tok.id, VISIBLE_EMBEDDING_DIM))
                : []);
        return <PositionalEncodingScene t={t} tokens={state.tokens} embeddings={embeddings} />;
    },
    transform: (state) => {
        if (state.positionEncoded) return state;
        if (!state.embeddings) return state;
        const positionEncoded = state.embeddings.map((emb, i) => applyPositionRotation(emb, i, 1));
        return { ...state, positionEncoded };
    },
};

export default PositionalEncodingScene;
