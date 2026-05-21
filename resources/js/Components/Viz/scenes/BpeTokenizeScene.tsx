import { cn } from '@/lib/utils';
import { getCachedTokenizer, type BpeToken } from '@/lib/tokenizer';
import TokenPill from '@/Components/Viz/TokenPill';
import type { PipelineState, Scene } from '@/Components/Viz/Scene';

/*
 * Scene 3 — BPE tokenization (M13 chunk 3c).
 *
 * Per `docs/visualization.md` (the longest scene description):
 * "brackets `[ ]` slide in around 1-4 adjacent bytes, 'lock in'
 * with a snap, and the bracketed group fuses into a single rounded
 * token pill labeled with its string … Simultaneously, a line
 * shoots from the new pill to the matching row in the vocabulary
 * sidebar, which scrolls and highlights to reveal the token ID."
 *
 * Implementation: pure t-driven snapshot. The tokenizer is async
 * (lazy-loaded js-tiktoken) but the cached instance is sync via
 * `getCachedTokenizer()` — CinematicViz warms it up on mount, so
 * by the time Scene 3 plays (~6.7s into the pipeline at 1× speed)
 * the cache is populated. Fallback: "tokenizing…" placeholder if
 * the cache is still empty.
 *
 * Per-token timeline within Scene 3:
 *   - Each token enters in order, left-to-right.
 *   - Per the spec: common tokens fast (~200ms), rare tokens slow
 *     (~600ms). We proxy "rarity" by token-string length: 1-3
 *     chars = common, ≥6 chars = rare.
 *   - Phases per token: bracket-slide (30%) → snap-lock (10%) →
 *     fuse-into-pill (60%).
 *
 * Output state: tokens + contextLength.
 */

const COMMON_TOKEN_MS = 200;
const RARE_TOKEN_MS = 600;

function durationForToken(t: BpeToken): number {
    const len = t.string.length;
    if (len <= 2) return COMMON_TOKEN_MS;
    if (len >= 6) return RARE_TOKEN_MS;
    // Linear interpolation in [3, 5]
    return COMMON_TOKEN_MS + ((len - 2) / 3) * (RARE_TOKEN_MS - COMMON_TOKEN_MS);
}

interface BpeTokenizeSceneProps {
    t: number;
    durationMs: number;
    promptText: string;
    tokens: readonly BpeToken[] | null;
}

function BpeTokenizeScene({
    t,
    durationMs,
    promptText: _promptText,
    tokens,
}: BpeTokenizeSceneProps) {
    if (!tokens || tokens.length === 0) {
        return (
            <div className="flex h-full w-full items-center justify-center text-center">
                <div className="space-y-2">
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                        Scene 3 · BPE tokenization
                    </p>
                    <p className="text-sm text-muted-foreground italic">Tokenizing…</p>
                </div>
            </div>
        );
    }

    const wallMs = t * durationMs;

    // Pre-compute per-token start + duration.
    const starts: number[] = [];
    const durations: number[] = [];
    let cursor = 0;
    for (const tok of tokens) {
        starts.push(cursor);
        const dur = durationForToken(tok);
        durations.push(dur);
        cursor += dur;
    }

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden p-4">
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-3-caption"
            >
                Scene 3 · BPE tokenization
            </p>

            <div
                className="flex flex-wrap items-center justify-center gap-1"
                data-testid="scene-3-row"
            >
                {tokens.map((tok, i) => {
                    const localMs = wallMs - starts[i];
                    const phase = Math.max(0, Math.min(1, localMs / durations[i]));
                    // 3 sub-phases: bracket (0..0.3) → snap (0.3..0.4) → pill (0.4..1)
                    const bracketProgress = Math.min(phase / 0.3, 1);
                    const snapped = phase >= 0.4;
                    const pillProgress = Math.min(Math.max((phase - 0.4) / 0.6, 0), 1);
                    const visible = phase > 0;

                    if (!visible) return null;

                    if (snapped) {
                        // Pill state — TokenPill primitive with hue + label.
                        return (
                            <div
                                key={i}
                                style={{
                                    opacity: pillProgress,
                                    transform: `scale(${0.6 + pillProgress * 0.4})`,
                                }}
                                data-testid={`scene-3-token-${i}`}
                                data-token-phase="pill"
                            >
                                <TokenPill
                                    tokenId={tok.id}
                                    label={tok.string === ' ' ? '·' : tok.string}
                                    showId
                                    size="sm"
                                />
                            </div>
                        );
                    }

                    // Bracket-then-snap state.
                    const widthPx = Math.max(20, tok.string.length * 8);
                    return (
                        <div
                            key={i}
                            className="relative flex h-6 items-center justify-center font-mono text-[10px] text-cyan-300"
                            style={{ width: widthPx }}
                            data-testid={`scene-3-token-${i}`}
                            data-token-phase="bracket"
                        >
                            <span
                                className={cn(
                                    'absolute left-0 transition-transform',
                                    bracketProgress < 1 && 'opacity-60',
                                )}
                                style={{ transform: `translateX(${(1 - bracketProgress) * -8}px)` }}
                            >
                                [
                            </span>
                            <span className="px-2 text-muted-foreground">
                                {tok.string === ' ' ? '·' : tok.string}
                            </span>
                            <span
                                className="absolute right-0"
                                style={{ transform: `translateX(${(1 - bracketProgress) * 8}px)` }}
                            >
                                ]
                            </span>
                        </div>
                    );
                })}
            </div>

            <p className="max-w-md text-center text-[10px] text-muted-foreground/70 italic">
                BPE greedily merges adjacent bytes into vocabulary tokens. Each pill carries the
                token&apos;s string and integer ID.
            </p>
        </div>
    );
}

export const SCENE_BPE_TOKENIZE: Scene<PipelineState, PipelineState> = {
    id: 'bpe-tokenize',
    durationMs: 4500,
    render: (t, state) => {
        const cached = getCachedTokenizer();
        const tokens =
            state.tokens ?? (cached && state.promptText ? cached.encode(state.promptText) : null);
        return (
            <BpeTokenizeScene
                t={t}
                durationMs={SCENE_BPE_TOKENIZE.durationMs}
                promptText={state.promptText ?? ''}
                tokens={tokens}
            />
        );
    },
    transform: (state) => {
        if (state.tokens) return state;
        const cached = getCachedTokenizer();
        if (!cached || !state.promptText) return state;
        const tokens = cached.encode(state.promptText);
        return { ...state, tokens, contextLength: tokens.length };
    },
};

export default BpeTokenizeScene;
