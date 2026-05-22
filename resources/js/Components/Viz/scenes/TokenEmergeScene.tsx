import TokenPill from '@/Components/Viz/TokenPill';
import {
    pickTopK,
    sampleByMode,
    softmax,
    synthesizeLogits,
    syntheticTokenString,
} from '@/lib/syntheticLogits';
import { type PipelineState, type ProbabilityBar, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 17 — Token emerges (M13 chunk 8b).
 *
 * Per `phase1.md:1026` + `visualization.md:135-137`: "The winning
 * token flies down and appends to a 'generated so far' tray that
 * has been sitting empty at the bottom of the canvas. The string
 * also begins to appear in a mock chat-bubble UI in the corner."
 *
 * Chunk 8b only handles the in-canvas tray. The off-canvas
 * `ChatBubble` component stays a chunk-1 stub; chunk 10 wires it
 * to the same `generatedTokens` field.
 *
 * Phases within t (500ms):
 *   0.00 - 0.40 : winning token visible above (large flash); flies
 *                 downward via translateY
 *   0.40 - 0.80 : token enters tray at bottom-right of generated
 *                 row; bounces slightly
 *   0.80 - 1.00 : token settles into the row; emerald pulse fades
 *
 * Output state: `generatedTokens` — appended with the winner.
 */

const FLY_DISTANCE = 80;
const DEFAULT_VOCAB_SIZE = 128_000;
const LOGITS_SCENE_SEED = 0xc0ffee;

interface TokenEmergeSceneProps {
    t: number;
    state: PipelineState;
    winner: { vocabIndex: number; string: string; prob: number } | null;
    priorTokens: readonly { vocabIndex: number; string: string }[];
}

function TokenEmergeScene({ t, winner, priorTokens }: TokenEmergeSceneProps) {
    const flyProgress = Math.min(1, t / 0.4);
    const bounceProgress = t < 0.4 ? 0 : t > 0.8 ? 1 : (t - 0.4) / 0.4;
    const settleProgress = t < 0.8 ? 0 : (t - 0.8) / 0.2;

    const winnerY = FLY_DISTANCE * flyProgress;
    const bounce = bounceProgress > 0 ? Math.sin(bounceProgress * Math.PI * 2) * 6 : 0;
    const pulseOpacity = 1 - settleProgress;

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-17-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-17-caption"
            >
                Scene 17 · Token emerges
            </p>

            <div className="relative flex h-32 w-full items-center justify-center">
                {winner && t < 0.85 && (
                    <div
                        className="absolute text-lg font-mono font-semibold"
                        style={{
                            transform: `translateY(${winnerY + bounce}px)`,
                            opacity: 1 - settleProgress,
                        }}
                        data-testid="scene-17-flying-token"
                    >
                        <span className="rounded-md border border-emerald-500/50 bg-emerald-500/15 px-3 py-1 text-emerald-300">
                            {prettify(winner.string)}
                        </span>
                    </div>
                )}
            </div>

            <div
                className="flex w-full max-w-3xl flex-col items-center gap-1 rounded-md border border-border bg-card/40 p-2"
                data-testid="scene-17-tray"
            >
                <p className="text-[9px] font-medium uppercase tracking-wider text-emerald-400">
                    Generated so far
                </p>
                <div
                    className="flex flex-wrap items-center justify-start gap-1"
                    data-testid="scene-17-tray-row"
                >
                    {priorTokens.map((tok, i) => (
                        <TokenPill
                            key={`prior-${i}`}
                            tokenId={tok.vocabIndex}
                            label={prettify(tok.string)}
                            size="sm"
                        />
                    ))}
                    {winner && (
                        <div
                            className="relative"
                            style={{
                                opacity: bounceProgress,
                                transform: `scale(${1 + pulseOpacity * 0.15})`,
                            }}
                            data-testid="scene-17-new-token"
                        >
                            <TokenPill
                                tokenId={winner.vocabIndex}
                                label={prettify(winner.string)}
                                size="sm"
                            />
                            {pulseOpacity > 0 && (
                                <div
                                    className="absolute -inset-1 rounded-md border-2 border-emerald-400"
                                    style={{ opacity: pulseOpacity * 0.6 }}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            <p className="max-w-md text-center text-[9px] italic text-muted-foreground/70">
                The sampled token joins the generated sequence. In the live UI it also appears in
                the chat bubble in the corner (chunk-10 wiring).
            </p>
        </div>
    );
}

function prettify(s: string): string {
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

function deriveWinner(
    state: PipelineState,
): { vocabIndex: number; string: string; prob: number } | null {
    if (state.sampledToken) return state.sampledToken;
    if (state.probabilities && state.probabilities.length > 0) {
        const probs = state.probabilities.map((b: ProbabilityBar) => b.prob);
        const sampledIndex = sampleByMode(
            probs,
            state.samplingMode ?? 'greedy',
            state.samplingK ?? 40,
            state.samplingP ?? 0.95,
            state.tokens?.length ?? 0,
        );
        const winner = state.probabilities[sampledIndex];
        return {
            vocabIndex: winner.vocabIndex,
            string: winner.string,
            prob: winner.prob,
        };
    }
    const logits = sourceLogits(state);
    if (logits.length === 0) return null;
    const topK = pickTopK(logits, 16);
    const probs = softmax(
        topK.map((e) => e.value),
        state.samplingTemperature ?? 1.0,
    );
    const sampledIndex = sampleByMode(
        probs,
        state.samplingMode ?? 'greedy',
        state.samplingK ?? 40,
        state.samplingP ?? 0.95,
        state.tokens?.length ?? 0,
    );
    return {
        vocabIndex: topK[sampledIndex].index,
        string: syntheticTokenString(sampledIndex),
        prob: probs[sampledIndex],
    };
}

export const SCENE_TOKEN_EMERGE: Scene<PipelineState, PipelineState> = {
    id: 'token-emerge',
    durationMs: 500,
    render: (t, state) => (
        <TokenEmergeScene
            t={t}
            state={state}
            winner={deriveWinner(state)}
            priorTokens={state.generatedTokens ?? []}
        />
    ),
    transform: (state) => {
        const winner = deriveWinner(state);
        if (!winner) return state;
        // Idempotency: if the latest generatedTokens entry already
        // matches the winner, no-op. Required so a Scene 17 replay
        // at scrub time doesn't append duplicates.
        const prior = state.generatedTokens ?? [];
        const lastEntry = prior[prior.length - 1];
        if (
            lastEntry &&
            lastEntry.vocabIndex === winner.vocabIndex &&
            lastEntry.string === winner.string
        ) {
            return state;
        }
        return {
            ...state,
            generatedTokens: [...prior, { vocabIndex: winner.vocabIndex, string: winner.string }],
            sampledToken: state.sampledToken ?? winner,
        };
    },
};

export default TokenEmergeScene;
