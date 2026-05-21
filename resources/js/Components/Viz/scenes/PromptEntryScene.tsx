import { cn } from '@/lib/utils';
import type { PipelineState, Scene } from '@/Components/Viz/Scene';

/*
 * Scene 0 — Prompt entry (M13 chunk 3b).
 *
 * Per `docs/visualization.md`: "A chat textbox in the center of
 * the canvas. The user's prompt types itself in (or pastes in).
 * At end of scene the textbox glows once and the characters
 * detach from it, floating slightly above the box."
 *
 * Implementation: a pure t-driven snapshot. The scene runner
 * advances `t ∈ [0, 1]` at 60 Hz; this component renders the
 * frame for that t.
 *
 * Phases within t:
 *   - 0.00 … 0.75 : typing (linear interpolation of visible chars)
 *   - 0.75 … 0.90 : textbox glow (border pulses brightens)
 *   - 0.90 … 1.00 : characters detach + float up (translate-Y -16px)
 *
 * The spec calls Scene 0 "0.5s" but a 30-char prompt at 0.5s is
 * too fast to read. We bias to 1800ms so the typing reads at a
 * comfortable pace; the user can 4× via PlaybackControls.
 *
 * Output state: same as input. promptText was already in
 * PipelineState; this scene just animates the entry.
 */

interface PromptEntrySceneProps {
    t: number;
    promptText: string;
}

function PromptEntryScene({ t, promptText }: PromptEntrySceneProps) {
    const totalChars = Array.from(promptText).length;
    // Typing phase ends at t=0.75 so the glow + detach phases have
    // breathing room.
    const typingProgress = Math.min(t / 0.75, 1);
    const visibleCount = Math.floor(typingProgress * totalChars);
    const visible = Array.from(promptText).slice(0, visibleCount).join('');

    const glowing = t >= 0.75 && t < 0.95;
    const detaching = t >= 0.9;
    const detachProgress = Math.min((t - 0.9) / 0.1, 1);

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6">
            {/* Chat textbox — fades when detaching. */}
            <div
                className={cn(
                    'relative w-full max-w-xl rounded-lg border-2 bg-card/40 p-4 transition-all duration-300',
                    glowing
                        ? 'border-cyan-300 shadow-[0_0_24px_rgba(103,232,249,0.45)]'
                        : 'border-border',
                    detaching && 'opacity-30',
                )}
                style={{ opacity: detaching ? 1 - detachProgress * 0.7 : 1 }}
                data-testid="scene-0-textbox"
            >
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Prompt
                </p>
                <p
                    className="mt-2 min-h-[3em] font-mono text-sm text-foreground/90 whitespace-pre-wrap"
                    data-testid="scene-0-typed-text"
                >
                    {visible}
                    {typingProgress < 1 && (
                        <span
                            className="ml-0.5 inline-block motion-safe:animate-pulse"
                            aria-hidden="true"
                        >
                            ▍
                        </span>
                    )}
                </p>
            </div>

            {/* Detaching characters — appear during the last 10% of t. */}
            {detaching && (
                <div
                    className="flex flex-wrap items-center justify-center gap-1 font-mono text-sm"
                    style={{
                        transform: `translateY(${-detachProgress * 16}px)`,
                        opacity: detachProgress,
                    }}
                    data-testid="scene-0-floating-chars"
                >
                    {Array.from(promptText).map((ch, i) => (
                        <span key={i} className="rounded bg-card/60 px-1 text-foreground/85">
                            {ch === ' ' ? '·' : ch}
                        </span>
                    ))}
                </div>
            )}

            {/* Sub-caption */}
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-0-caption"
            >
                Scene 0 · Prompt entry
            </p>
        </div>
    );
}

export const SCENE_PROMPT_ENTRY: Scene<PipelineState, PipelineState> = {
    id: 'prompt-entry',
    durationMs: 1800,
    render: (t, state) => <PromptEntryScene t={t} promptText={state.promptText ?? ''} />,
    transform: (state) => state,
};

export default PromptEntryScene;
