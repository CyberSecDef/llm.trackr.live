import { useMemo } from 'react';
import {
    applyFFN,
    expandToFFNDim,
    gelu,
    pickNonlinearity,
    sparklePositions,
    swish,
} from '@/lib/syntheticFFN';
import { viridisAt, normalize } from '@/lib/vizColors';
import { type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 10 — Feed-forward network (M13 chunk 6).
 *
 * Per `docs/visualization.md`: "Vector strips flow through a visible
 * 'pipe' that expands to ~4x width…passes through a non-linearity
 * (render as a brief wavy distortion or color shift representing
 * SwiGLU), then contracts back. The expanded middle section can
 * briefly show many more cells, emphasizing where most parameters
 * live. Optional flavor: tiny 'neuron firing' sparkles inside the
 * expanded region."
 *
 * Phases within t (3000ms total):
 *   0.00 - 0.15 : input strip visible at left, pipe outline
 *                 materializes
 *   0.15 - 0.40 : input slides into pipe; cell count ramps to 4×
 *   0.40 - 0.60 : peak expansion (4× cells, sparkles fire,
 *                 non-linearity wave starts)
 *   0.60 - 0.85 : contraction back to input dim; non-linearity
 *                 wave completes
 *   0.85 - 1.00 : output strip emerges at right
 *
 * Architecture-aware label: `pickNonlinearity(architecture_type)`
 * returns 'GELU' (default + classic transformer) or 'SwiGLU'
 * (Llama / Mistral / Qwen / MoE). The rendered activation matches
 * the label; visually both look like the same wavy shift, but the
 * label communicates which architecture the user is exploring.
 */

const TOKEN_RENDER_CAP = 4;
const SPARKLE_COUNT = 10;
const PIPE_HEIGHT = 26;
const INPUT_VISIBLE_CELLS = 32;
const EXPANDED_VISIBLE_CELLS = 128;

interface FFNSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    residuals: readonly (readonly number[])[];
    archType: string | null;
}

function FFNScene({ t, tokens, residuals, archType }: FFNSceneProps) {
    const tokenList = tokens ?? [];
    const nonlinearityName = pickNonlinearity(archType);

    // Expansion factor envelope: 1 → 4 → 1 across t.
    // Bell-ish curve, peaks at t=0.5, narrow.
    const expansionAmount = expansionEnvelope(t);
    // Cell count to render — interpolates input cells → expanded cells → input.
    const visibleCells = Math.round(
        INPUT_VISIBLE_CELLS + (EXPANDED_VISIBLE_CELLS - INPUT_VISIBLE_CELLS) * expansionAmount,
    );
    // Pipe width follows the same envelope.
    const pipeWidth = 200 + 200 * expansionAmount;

    // Non-linearity wave: a hot column that sweeps left-to-right across
    // [0.5, 0.85] of t. Outside that range, no wave.
    const waveProgress = Math.max(0, Math.min((t - 0.5) / 0.35, 1));
    const waveActive = t >= 0.45 && t <= 0.9;

    // Output emerges in the last 15% of t.
    const outputOpacity = Math.max(0, Math.min((t - 0.85) / 0.15, 1));

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-10-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-10-caption"
            >
                Scene 10 · Feed-forward network
            </p>
            <p
                className="text-[9px] font-mono text-muted-foreground"
                data-testid="scene-10-nonlinearity-label"
            >
                Non-linearity: <span className="text-cyan-300">{nonlinearityName}</span> ·
                hidden_dim → 4 × hidden_dim → hidden_dim
            </p>

            <div className="flex w-full flex-col items-center gap-2" data-testid="scene-10-rows">
                {tokenList.slice(0, TOKEN_RENDER_CAP).map((tok, i) => (
                    <FFNRow
                        key={i}
                        token={tok}
                        tokenIndex={i}
                        input={residuals[i] ?? []}
                        archType={archType}
                        expansionAmount={expansionAmount}
                        visibleCells={visibleCells}
                        pipeWidth={pipeWidth}
                        waveProgress={waveProgress}
                        waveActive={waveActive}
                    />
                ))}
            </div>

            {outputOpacity > 0 && (
                <p
                    className="text-[9px] font-medium uppercase tracking-wider text-emerald-400"
                    style={{ opacity: outputOpacity }}
                    data-testid="scene-10-output-label"
                >
                    Output → next residual
                </p>
            )}
        </div>
    );
}

interface FFNRowProps {
    token: { id: number; string: string };
    tokenIndex: number;
    input: readonly number[];
    archType: string | null;
    expansionAmount: number;
    visibleCells: number;
    pipeWidth: number;
    waveProgress: number;
    waveActive: boolean;
}

function FFNRow({
    token,
    tokenIndex,
    input,
    archType,
    expansionAmount,
    visibleCells,
    pipeWidth,
    waveProgress,
    waveActive,
}: FFNRowProps) {
    // Pre-compute the expanded + activated vectors. The strip renders
    // input cells when expansionAmount < 0.5 (entry/exit of the pipe)
    // and the post-activation expanded cells during the peak. The
    // visible-cell count + pipe-width animation carry the
    // "expand → activate → contract" beat; underlying values stay
    // bounded so cells don't visually pop.
    const displayed = useMemo(() => {
        if (input.length === 0) return [] as number[];
        if (expansionAmount > 0.5) {
            const expanded = expandToFFNDim(input, 4, tokenIndex);
            const activation = pickNonlinearity(archType) === 'SwiGLU' ? swish : gelu;
            return expanded.map(activation);
        }
        return input as number[];
    }, [input, tokenIndex, archType, expansionAmount]);

    const sparkles = useMemo(() => sparklePositions(tokenIndex, SPARKLE_COUNT), [tokenIndex]);

    // Sparkle opacity envelope: fades in/out around the expansion peak.
    const sparkleOpacity = sparkleEnvelope(expansionAmount);

    const visibleSlice = displayed.slice(0, visibleCells);
    const normedSlice = normalize(visibleSlice);

    return (
        <div
            className="flex items-center gap-2 font-mono"
            data-testid={`scene-10-row-${tokenIndex}`}
        >
            <span className="w-6 rounded bg-card/60 px-1 py-0.5 text-center text-[9px] tabular-nums text-muted-foreground">
                {tokenIndex}
            </span>

            {/* Pipe container — width animates with expansionAmount */}
            <div
                className="relative rounded-md border border-cyan-500/30 bg-slate-950/80"
                style={{
                    width: pipeWidth,
                    height: PIPE_HEIGHT,
                    transition: 'width 0ms', // driven by t
                }}
                data-testid={`scene-10-pipe-${tokenIndex}`}
            >
                {/* Strip cells */}
                <svg
                    width={pipeWidth}
                    height={PIPE_HEIGHT}
                    aria-hidden="true"
                    className="absolute inset-0"
                >
                    {normedSlice.map((v, k) => {
                        const cellWidth = pipeWidth / Math.max(1, normedSlice.length);
                        // Wave column: a hot vertical bar sweeping L→R during the
                        // non-linearity beat.
                        const x = k * cellWidth;
                        const waveX = waveActive ? waveProgress * pipeWidth : -1;
                        const inWave = waveActive && Math.abs(x - waveX) < cellWidth * 2;
                        return (
                            <rect
                                key={k}
                                x={x}
                                y={0}
                                width={cellWidth + 0.5}
                                height={PIPE_HEIGHT}
                                fill={inWave ? '#fbbf24' : viridisAt(v)}
                                opacity={inWave ? 0.9 : 0.85}
                            />
                        );
                    })}

                    {/* Sparkles during expansion peak */}
                    {sparkles.map((s, k) => (
                        <circle
                            key={k}
                            cx={s.x * pipeWidth}
                            cy={s.y * PIPE_HEIGHT}
                            r={1.2}
                            fill="#fde68a"
                            opacity={sparkleOpacity}
                            data-testid={`scene-10-sparkle-${tokenIndex}-${k}`}
                        />
                    ))}
                </svg>
            </div>

            <span
                className="max-w-[60px] truncate text-[9px] text-muted-foreground/70"
                title={token.string}
            >
                {token.string === ' ' ? '·' : token.string}
            </span>
        </div>
    );
}

/**
 * Expansion envelope: 0 at t=0 → 1 around t=0.5 → 0 at t=1.
 * Approximates a smoothed bell curve. Holds at 1 between t=0.4
 * and t=0.6 so the "peak" beat sits long enough to read.
 */
function expansionEnvelope(t: number): number {
    if (t < 0.15) return 0;
    if (t < 0.4) return (t - 0.15) / 0.25;
    if (t <= 0.6) return 1;
    if (t < 0.85) return 1 - (t - 0.6) / 0.25;
    return 0;
}

/**
 * Sparkle opacity: only visible during the expansion peak, with a
 * brief fade-in / fade-out at the boundaries. Returns 0 when
 * expansionAmount < 0.6 (sparkles only at peak).
 */
function sparkleEnvelope(expansionAmount: number): number {
    if (expansionAmount < 0.6) return 0;
    return Math.min(1, (expansionAmount - 0.6) * 2.5);
}

export const SCENE_FFN: Scene<PipelineState, PipelineState> = {
    id: 'ffn',
    durationMs: 3000,
    render: (t, state) => {
        const residuals =
            state.residualOutput ??
            state.attentionOutput ??
            state.layerNormed ??
            state.positionEncoded ??
            state.embeddings ??
            [];
        return (
            <FFNScene
                t={t}
                tokens={state.tokens}
                residuals={residuals}
                archType={state.architectureType ?? null}
            />
        );
    },
    transform: (state) => {
        if (state.ffnOutput) return state;
        const residuals =
            state.residualOutput ??
            state.attentionOutput ??
            state.layerNormed ??
            state.positionEncoded ??
            state.embeddings;
        if (!residuals || residuals.length === 0) return state;
        const archType = state.architectureType ?? null;
        const ffnOutput = residuals.map((v, i) => applyFFN(v, i, archType));
        return { ...state, ffnOutput };
    },
};

export default FFNScene;
