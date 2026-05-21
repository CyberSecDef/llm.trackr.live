import { cn } from '@/lib/utils';
import { charsToBytes, type CharByteMapping } from '@/lib/textEncoding';
import type { PipelineState, Scene } from '@/Components/Viz/Scene';

/*
 * Scene 1 — Characters → UTF-8 bytes (M13 chunk 3b).
 *
 * Per `docs/visualization.md`: "Each character bounces up about
 * 40px in a staggered wave (left to right, ~30ms offset per char).
 * At peak it flips 180° on the X-axis and lands as its byte value.
 * Multi-byte UTF-8 chars (emoji, non-Latin) split into 2-4 numbers
 * — emphasize this with a tiny 'split' animation."
 *
 * The teaching beat: bytes ≠ characters. ASCII chars stay as one
 * byte; emoji explode into 4; é into 2. Splitting visually makes
 * the inverse-of-tokenization clear before BPE merges in Scene 3.
 *
 * Phases per char (each char is offset by `i × 30ms`):
 *   - Pre-launch  : char sits in place (above-byte y = 0)
 *   - Launch      : bounces up 40px (y < 0)
 *   - Apex flip   : 180° X-axis flip, the char text fades + byte
 *                   text appears
 *   - Landing     : back to y = 0, byte values shown (split for
 *                   multi-byte chars)
 *
 * We compute the per-char timeline inside the scene render so
 * any t maps to a deterministic frame.
 */

const CHAR_STAGGER_MS = 60; // ms offset between adjacent chars
const PER_CHAR_DURATION_MS = 700; // each char's launch→land arc

interface CharsToBytesSceneProps {
    t: number;
    durationMs: number;
    promptText: string;
    charBytes: readonly CharByteMapping[];
}

function CharsToBytesScene({ t, durationMs, promptText, charBytes }: CharsToBytesSceneProps) {
    const mappings = charBytes.length > 0 ? charBytes : charsToBytes(promptText);
    const wallMs = t * durationMs;

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden p-4">
            {/* Caption */}
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-1-caption"
            >
                Scene 1 · Characters → UTF-8 bytes
            </p>

            <div
                className="flex flex-wrap items-end justify-center gap-2 font-mono text-xs"
                data-testid="scene-1-row"
            >
                {mappings.map((m, i) => {
                    const launchAtMs = i * CHAR_STAGGER_MS;
                    const localMs = wallMs - launchAtMs;
                    const phase = Math.max(0, Math.min(1, localMs / PER_CHAR_DURATION_MS));
                    // Bell-curve bounce: y = -40 * sin(πφ) for 0..1
                    const bounceY = -40 * Math.sin(Math.PI * phase);
                    // Flip angle peaks at phase 0.5
                    const flipAngle = phase < 0.5 ? phase * 360 : 180 + (phase - 0.5) * 360;
                    // Switch the visible label from char→byte at phase=0.5
                    const showByte = phase >= 0.5;
                    const isMultiByte = m.bytes.length > 1;

                    return (
                        <div
                            key={i}
                            className="flex flex-col items-center"
                            data-testid={`scene-1-cell-${i}`}
                            data-phase={phase.toFixed(2)}
                        >
                            <div
                                className={cn(
                                    'inline-flex min-w-[28px] flex-col items-center rounded border px-1.5 py-1 text-center',
                                    showByte
                                        ? 'border-cyan-700 bg-cyan-950/40 text-cyan-200'
                                        : 'border-border bg-card/60 text-foreground/90',
                                    isMultiByte && showByte && 'ring-1 ring-amber-500/40',
                                )}
                                style={{
                                    transform: `translateY(${bounceY}px) rotateX(${flipAngle}deg)`,
                                    transition: 'none',
                                }}
                            >
                                {!showByte ? (
                                    <span className="text-sm">
                                        {m.char === ' ' ? '·' : m.char === '\n' ? '↵' : m.char}
                                    </span>
                                ) : (
                                    // Multi-byte: render each byte stacked
                                    <div className="flex flex-col gap-0.5 tabular-nums">
                                        {m.bytes.map((b, j) => (
                                            <span key={j} className="text-[10px]">
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Source char fade-label under the cell */}
                            <span
                                className={cn(
                                    'mt-1 text-[9px] text-muted-foreground/70 transition-opacity',
                                    showByte ? 'opacity-100' : 'opacity-40',
                                )}
                            >
                                {m.char === ' ' ? '·' : m.char === '\n' ? '↵' : m.char}
                            </span>
                            {/* Multi-byte teaching beat */}
                            {isMultiByte && showByte && (
                                <span
                                    className="mt-0.5 text-[8px] font-medium uppercase tracking-wider text-amber-400"
                                    data-testid={`scene-1-multibyte-tag-${i}`}
                                >
                                    {m.bytes.length}-byte
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="max-w-md text-center text-[10px] text-muted-foreground/70 italic">
                Multi-byte characters (emoji, accented letters, CJK) expand into 2-4 UTF-8 bytes.
                &ldquo;Bytes &ne; characters.&rdquo;
            </p>
        </div>
    );
}

export const SCENE_CHARS_TO_BYTES: Scene<PipelineState, PipelineState> = {
    id: 'chars-to-bytes',
    durationMs: 2400,
    render: (t, state) => (
        <CharsToBytesScene
            t={t}
            durationMs={SCENE_CHARS_TO_BYTES.durationMs}
            promptText={state.promptText ?? ''}
            charBytes={state.charBytes ?? []}
        />
    ),
    transform: (state) => ({
        ...state,
        charBytes: state.charBytes ?? charsToBytes(state.promptText ?? ''),
    }),
};

export default CharsToBytesScene;
