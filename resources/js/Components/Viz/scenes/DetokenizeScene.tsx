import TokenPill from '@/Components/Viz/TokenPill';
import { type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 20 — Detokenization + end-of-sequence flourish (M13 chunk 9b).
 *
 * Per `phase1.md:1028` + `visualization.md:149-151`:
 *   "As each token ID is chosen in Scene 17, show it briefly
 *   transforming back into its string fragment via a quick
 *   reverse-lookup to the vocabulary sidebar… then the string
 *   fragment flies into the chat bubble and concatenates.
 *   End-of-sequence token: chat bubble glows, full pipeline canvas
 *   dims, completion flourish."
 *
 * Phases within t (3000ms):
 *   0.00 - 0.75 : per-token reverse-lookup montage. For each token
 *                 in generatedTokens (capped at 8 for visual budget):
 *                 tokenIndex → vocabIndex → "string" briefly
 *                 highlights; chat bubble grows.
 *   0.75 - 0.90 : final token completes; "EOS" badge appears.
 *   0.90 - 1.00 : canvas dims slightly, chat bubble glows with the
 *                 completion flourish.
 *
 * Output state: identity (camera/explanatory scene; tokens already
 * live in generatedTokens from Scene 17/18).
 */

const SCENE_20_DURATION = 3000;
const REVEAL_PHASE_END = 0.75;
const EOS_BADGE_END = 0.9;
const TOKEN_RENDER_CAP = 8;

interface DetokenizeSceneProps {
    t: number;
    state: PipelineState;
}

function DetokenizeScene({ t, state }: DetokenizeSceneProps) {
    const tokens = (state.generatedTokens ?? []).slice(0, TOKEN_RENDER_CAP);
    const tokenCount = Math.max(1, tokens.length);

    // Active token index during the reveal phase (0..tokenCount-1).
    const revealProgress = Math.max(0, Math.min(t / REVEAL_PHASE_END, 1));
    const activeIndex = Math.min(tokenCount - 1, Math.floor(revealProgress * tokenCount));

    // EOS badge fades in between REVEAL_PHASE_END and EOS_BADGE_END.
    const eosBadgeOpacity = Math.max(
        0,
        Math.min((t - REVEAL_PHASE_END) / (EOS_BADGE_END - REVEAL_PHASE_END), 1),
    );

    // Canvas-dim + bubble-glow flourish in the last 10% of t.
    const flourishProgress = Math.max(0, Math.min((t - EOS_BADGE_END) / 0.1, 1));

    const activeToken = tokens[activeIndex];

    return (
        <div
            className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            style={{
                backgroundColor: `rgba(2, 6, 23, ${flourishProgress * 0.45})`,
                transition: 'background-color 0ms',
            }}
            data-testid="scene-20-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-20-caption"
            >
                Scene 20 · Detokenization {flourishProgress > 0 && '· complete'}
            </p>

            {/* Reverse-lookup widget (active during reveal phase) */}
            {t < REVEAL_PHASE_END && activeToken && (
                <div
                    className="flex items-center gap-2 rounded-md border border-cyan-500/30 bg-card/40 px-3 py-1.5 font-mono text-[10px]"
                    data-testid="scene-20-lookup-widget"
                >
                    <span className="text-muted-foreground/70">token #{activeIndex + 1}</span>
                    <span className="text-muted-foreground/40">→</span>
                    <span
                        className="rounded bg-card/80 px-1.5 py-0.5 text-cyan-300"
                        data-testid="scene-20-vocab-index"
                    >
                        vocab[{activeToken.vocabIndex}]
                    </span>
                    <span className="text-muted-foreground/40">→</span>
                    <span
                        className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300"
                        data-testid="scene-20-string-result"
                    >
                        &quot;{prettify(activeToken.string)}&quot;
                    </span>
                </div>
            )}

            {/* EOS badge during the transition phase */}
            {eosBadgeOpacity > 0 && (
                <div
                    className="rounded-full border border-amber-500/50 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-amber-300"
                    style={{ opacity: eosBadgeOpacity }}
                    data-testid="scene-20-eos-badge"
                >
                    EOS
                </div>
            )}

            {/* Chat bubble — grows during reveal, glows during flourish */}
            <div
                className="flex w-full max-w-3xl flex-col items-start gap-1 rounded-md border bg-card/40 p-3 transition-none"
                style={{
                    borderColor:
                        flourishProgress > 0
                            ? `rgba(52, 211, 153, ${0.4 + flourishProgress * 0.6})`
                            : undefined,
                    boxShadow:
                        flourishProgress > 0
                            ? `0 0 ${flourishProgress * 24}px rgba(52, 211, 153, ${flourishProgress * 0.4})`
                            : undefined,
                }}
                data-testid="scene-20-chat-bubble"
            >
                <p className="text-[9px] font-medium uppercase tracking-wider text-emerald-400">
                    Chat bubble · {tokens.length} tokens emitted
                </p>
                <div className="flex flex-wrap items-center gap-1">
                    {tokens.map((tok, i) => {
                        const isActive = i === activeIndex && t < REVEAL_PHASE_END;
                        const hasLanded = i <= activeIndex || t >= REVEAL_PHASE_END;
                        return (
                            <div
                                key={i}
                                style={{
                                    opacity: hasLanded ? 1 : 0.25,
                                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                }}
                                data-testid={`scene-20-chat-token-${i}`}
                            >
                                <TokenPill
                                    tokenId={tok.vocabIndex}
                                    label={prettify(tok.string)}
                                    size="sm"
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <p
                className="max-w-md text-center text-[9px] italic text-muted-foreground/70"
                data-testid="scene-20-footnote"
            >
                Each chosen vocab index reverse-looks-up to its string fragment. On the
                end-of-sequence token the generation stops and the full response is the
                concatenation of every emitted string.
            </p>

            {/* Final completion flourish overlay */}
            {flourishProgress > 0 && (
                <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    data-testid="scene-20-flourish"
                >
                    <p
                        className="text-[11px] font-mono font-semibold uppercase tracking-widest text-emerald-300"
                        style={{ opacity: flourishProgress }}
                    >
                        Inference complete
                    </p>
                </div>
            )}
        </div>
    );
}

function prettify(s: string): string {
    if (s === ' ') return '·';
    if (s === '\n') return '↵';
    if (s.startsWith(' ')) return '·' + s.slice(1);
    return s;
}

export const SCENE_DETOKENIZE: Scene<PipelineState, PipelineState> = {
    id: 'detokenize',
    durationMs: SCENE_20_DURATION,
    render: (t, state) => <DetokenizeScene t={t} state={state} />,
    transform: (state) => state,
};

export default DetokenizeScene;
