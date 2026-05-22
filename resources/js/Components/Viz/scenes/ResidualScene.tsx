import VectorStrip from '@/Components/Viz/VectorStrip';
import { applyResidual } from '@/lib/syntheticFFN';
import { type PipelineState, type Scene, type SceneId } from '@/Components/Viz/Scene';

/*
 * ResidualScene (M13 chunk 6) — generic component + factory for
 * Scenes 9 and 11. Both scenes have the identical narrative
 * (ghost-back stream + main stream → element-wise sum) and differ
 * only in which PipelineState fields they consume / produce.
 *
 * Phases within t (0..1):
 *   0.00 - 0.30 : ghost (left, dim) + main (right, bright) strips
 *                 are visible side-by-side; "+" symbol fades in
 *                 between them
 *   0.30 - 0.70 : streams "lean in" toward center; "+" pulses to
 *                 communicate the merge
 *   0.70 - 1.00 : combined output strip fades in below
 *
 * Spec: phase1.md:1022 + visualization.md:80-94. "Structural, not
 * flashy" — kept compact.
 */

type GhostSource = 'positionEncoded' | 'residualOutput';
type MainSource = 'attentionOutput' | 'ffnOutput';
type OutputField = 'residualOutput' | 'residualOutput2';

interface ResidualSceneConfig {
    id: SceneId;
    durationMs: number;
    /** Which field provides the "ghost" (pre-stage) stream. */
    ghostSource: GhostSource;
    /** Which field provides the "main" (just-computed) stream. */
    mainSource: MainSource;
    /** Which PipelineState field the sum is written to. */
    outputField: OutputField;
    /** Human-readable scene caption (e.g. "Scene 9 · Residual"). */
    caption: string;
    /** What the left column represents (e.g. "Pre-attention"). */
    ghostLabel: string;
    /** What the right column represents (e.g. "Attention output"). */
    mainLabel: string;
    /** Scene-number prefix for test IDs (e.g. "scene-9"). */
    testIdPrefix: string;
}

interface ResidualSceneProps {
    t: number;
    config: ResidualSceneConfig;
    tokens: PipelineState['tokens'];
    ghosts: readonly (readonly number[])[];
    mains: readonly (readonly number[])[];
}

function ResidualScene({ t, config, tokens, ghosts, mains }: ResidualSceneProps) {
    const tokenList = tokens ?? [];
    // Phase 1: streams visible (full intro). Phase 2: lean-in. Phase 3: output.
    const leanProgress = Math.max(0, Math.min((t - 0.3) / 0.4, 1));
    const plusOpacity = Math.min(1, t / 0.2);
    const plusPulse = 1 + Math.sin(t * Math.PI * 4) * 0.15 * Math.min(1, t / 0.3);
    const outputOpacity = Math.max(0, Math.min((t - 0.7) / 0.3, 1));

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid={`${config.testIdPrefix}-root`}
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid={`${config.testIdPrefix}-caption`}
            >
                {config.caption}
            </p>

            <div className="grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="text-right">
                    <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                        {config.ghostLabel}
                    </p>
                </div>
                <div />
                <div className="text-left">
                    <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                        {config.mainLabel}
                    </p>
                </div>
            </div>

            <div
                className="flex w-full max-w-2xl flex-col gap-1"
                data-testid={`${config.testIdPrefix}-rows`}
            >
                {tokenList.slice(0, 6).map((tok, i) => {
                    const ghost = ghosts[i] ?? [];
                    const main = mains[i] ?? [];
                    return (
                        <div
                            key={i}
                            className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3"
                            data-testid={`${config.testIdPrefix}-row-${i}`}
                        >
                            {/* Ghost strip (left) — slides right toward "+" */}
                            <div
                                className="flex items-center justify-end gap-1"
                                style={{
                                    transform: `translateX(${leanProgress * 16}px)`,
                                    opacity: 0.5 + leanProgress * 0.3,
                                }}
                            >
                                <span className="max-w-[60px] truncate text-[9px] text-muted-foreground/70">
                                    {tok.string === ' ' ? '·' : tok.string}
                                </span>
                                <VectorStrip
                                    values={ghost}
                                    visibleCells={Math.min(64, ghost.length)}
                                    totalLength={4096}
                                    width={160}
                                    height={10}
                                />
                            </div>

                            {/* + symbol */}
                            <div
                                className="flex items-center justify-center text-emerald-400"
                                style={{
                                    opacity: plusOpacity,
                                    transform: `scale(${plusPulse})`,
                                }}
                                data-testid={`${config.testIdPrefix}-plus-${i}`}
                            >
                                <span className="text-base font-bold">+</span>
                            </div>

                            {/* Main strip (right) — slides left toward "+" */}
                            <div
                                className="flex items-center gap-1"
                                style={{
                                    transform: `translateX(${-leanProgress * 16}px)`,
                                }}
                            >
                                <VectorStrip
                                    values={main}
                                    visibleCells={Math.min(64, main.length)}
                                    totalLength={4096}
                                    width={160}
                                    height={10}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {outputOpacity > 0 && (
                <div
                    className="mt-2 flex w-full max-w-2xl flex-col items-center gap-1"
                    style={{ opacity: outputOpacity }}
                    data-testid={`${config.testIdPrefix}-output`}
                >
                    <p className="text-[9px] font-medium uppercase tracking-wider text-emerald-400">
                        Sum → next stage
                    </p>
                    {tokenList.slice(0, 6).map((tok, i) => {
                        const sum = applyResidual(ghosts[i] ?? [], mains[i] ?? []);
                        return (
                            <div
                                key={i}
                                className="flex items-center gap-2"
                                data-testid={`${config.testIdPrefix}-output-row-${i}`}
                            >
                                <span className="w-6 rounded bg-card/60 px-1 py-0.5 text-center text-[9px] tabular-nums text-muted-foreground">
                                    {i}
                                </span>
                                <VectorStrip
                                    values={sum}
                                    visibleCells={Math.min(96, sum.length)}
                                    totalLength={4096}
                                    width={260}
                                    height={10}
                                />
                                <span className="max-w-[60px] truncate text-[9px] text-muted-foreground/70">
                                    {tok.string === ' ' ? '·' : tok.string}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/**
 * Build a `Scene<PipelineState, PipelineState>` keyed by which
 * PipelineState fields feed in and which receives the sum. Used
 * to register Scene 9 (positionEncoded + attentionOutput →
 * residualOutput) and Scene 11 (residualOutput + ffnOutput →
 * residualOutput2) from the same component.
 */
export function createResidualScene(
    config: ResidualSceneConfig,
): Scene<PipelineState, PipelineState> {
    const sourceFallback = (
        state: PipelineState,
        field: GhostSource | MainSource,
    ): readonly (readonly number[])[] => {
        const direct = state[field];
        if (direct) return direct;
        // Best-effort fallback chain for isolated scene tests / scrubbing.
        // The fallback walks down to embeddings → tokens, mirroring the
        // pattern from chunks 5 and 8.
        return state.layerNormed ?? state.positionEncoded ?? state.embeddings ?? [];
    };

    return {
        id: config.id,
        durationMs: config.durationMs,
        render: (t, state) => {
            const ghosts = sourceFallback(state, config.ghostSource);
            const mains = sourceFallback(state, config.mainSource);
            return (
                <ResidualScene
                    t={t}
                    config={config}
                    tokens={state.tokens}
                    ghosts={ghosts}
                    mains={mains}
                />
            );
        },
        transform: (state) => {
            if (state[config.outputField]) return state;
            const ghosts = sourceFallback(state, config.ghostSource);
            const mains = sourceFallback(state, config.mainSource);
            if (ghosts.length === 0 || mains.length === 0) return state;
            const n = Math.min(ghosts.length, mains.length);
            const sum: number[][] = [];
            for (let i = 0; i < n; i++) {
                sum.push(applyResidual(ghosts[i], mains[i]));
            }
            return { ...state, [config.outputField]: sum };
        },
    };
}

export const SCENE_RESIDUAL_1 = createResidualScene({
    id: 'residual-1',
    durationMs: 1000,
    ghostSource: 'positionEncoded',
    mainSource: 'attentionOutput',
    outputField: 'residualOutput',
    caption: 'Scene 9 · Residual (pre-attention + attention)',
    ghostLabel: 'Pre-attention (ghost)',
    mainLabel: 'Attention output',
    testIdPrefix: 'scene-9',
});

export const SCENE_RESIDUAL_2 = createResidualScene({
    id: 'residual-2',
    durationMs: 1000,
    ghostSource: 'residualOutput',
    mainSource: 'ffnOutput',
    outputField: 'residualOutput2',
    caption: 'Scene 11 · Residual (pre-FFN + FFN)',
    ghostLabel: 'Pre-FFN (ghost)',
    mainLabel: 'FFN output',
    testIdPrefix: 'scene-11',
});

export default ResidualScene;
