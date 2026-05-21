import { cn } from '@/lib/utils';
import { charsToBytes, flattenBytes } from '@/lib/textEncoding';
import type { PipelineState, Scene } from '@/Components/Viz/Scene';

/*
 * Scene 2 — Chat-template wrap (M13 chunk 3b).
 *
 * Per `docs/visualization.md`: "Two new 'blocks' of bytes slide
 * in from offscreen — a system-prompt block from above (tinted
 * purple), and special role markers `<|user|>` / `<|assistant|>`
 * (tinted teal). They snap into position bracketing the user's
 * bytes. Show the special-token strings briefly as text labels,
 * then collapse them into their byte representations so the whole
 * row is uniform integers again."
 *
 * Phases:
 *   - 0.00 … 0.30 : system block slides in from top (purple)
 *   - 0.30 … 0.55 : <|user|> marker slides in from the left (teal)
 *                   on the user-prompt block's left edge
 *   - 0.55 … 0.80 : <|assistant|> marker slides in from the right
 *                   (teal) on the right edge
 *   - 0.80 … 1.00 : special-token strings collapse to byte integers
 *
 * The system prompt's literal text is fixed for the animation —
 * we use "You are a helpful assistant." as a stand-in. The
 * realistic value comes from the user's settings at run time, but
 * for the visualization a stable canonical example reads cleaner.
 *
 * Output state: chatTemplateBytes + chatTemplateTints. The full
 * byte stream is [system bytes] + [user marker bytes] + [user
 * prompt bytes] + [assistant marker bytes]. Tints map each byte
 * index to a section so Scene 3's BPE can color-code on top.
 */

const SYSTEM_PROMPT = 'You are a helpful assistant.';
const USER_MARKER = '<|user|>';
const ASSISTANT_MARKER = '<|assistant|>';

interface ChatTemplateSceneProps {
    t: number;
    promptText: string;
}

function ChatTemplateScene({ t, promptText }: ChatTemplateSceneProps) {
    const systemIn = Math.min(t / 0.3, 1);
    const userMarkerIn = Math.min(Math.max((t - 0.3) / 0.25, 0), 1);
    const assistantMarkerIn = Math.min(Math.max((t - 0.55) / 0.25, 0), 1);
    const collapseProgress = Math.min(Math.max((t - 0.8) / 0.2, 0), 1);

    const systemY = (1 - systemIn) * -40;
    const userMarkerX = (1 - userMarkerIn) * -60;
    const assistantMarkerX = (1 - assistantMarkerIn) * 60;
    const showAsBytes = collapseProgress > 0.5;

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden p-4">
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-2-caption"
            >
                Scene 2 · Chat-template wrap
            </p>

            <div
                className="flex flex-col items-center gap-2 font-mono text-xs"
                data-testid="scene-2-stack"
            >
                {/* System block */}
                <SectionBlock
                    label="system"
                    tint="purple"
                    style={{ transform: `translateY(${systemY}px)`, opacity: systemIn }}
                    text={SYSTEM_PROMPT}
                    showAsBytes={showAsBytes}
                    testId="scene-2-system"
                />

                {/* User row: <|user|>  + user prompt + <|assistant|> */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <SectionBlock
                        label="role"
                        tint="teal"
                        style={{
                            transform: `translateX(${userMarkerX}px)`,
                            opacity: userMarkerIn,
                        }}
                        text={USER_MARKER}
                        showAsBytes={showAsBytes}
                        testId="scene-2-user-marker"
                    />

                    {/* User's own prompt — untinted in this scene */}
                    <SectionBlock
                        label="user prompt"
                        tint="neutral"
                        style={{}}
                        text={promptText}
                        showAsBytes={showAsBytes}
                        testId="scene-2-user-prompt"
                    />

                    <SectionBlock
                        label="role"
                        tint="teal"
                        style={{
                            transform: `translateX(${assistantMarkerX}px)`,
                            opacity: assistantMarkerIn,
                        }}
                        text={ASSISTANT_MARKER}
                        showAsBytes={showAsBytes}
                        testId="scene-2-assistant-marker"
                    />
                </div>
            </div>

            <p className="max-w-md text-center text-[10px] text-muted-foreground/70 italic">
                Vendor APIs wrap the user prompt in chat-template markers + a system prompt before
                tokenizing. The whole thing becomes one byte stream.
            </p>
        </div>
    );
}

interface SectionBlockProps {
    label: string;
    tint: 'purple' | 'teal' | 'neutral';
    style: React.CSSProperties;
    text: string;
    showAsBytes: boolean;
    testId: string;
}

const TINT_CLASSES: Record<SectionBlockProps['tint'], string> = {
    purple: 'border-purple-700 bg-purple-950/40 text-purple-200',
    teal: 'border-teal-700 bg-teal-950/40 text-teal-200',
    neutral: 'border-border bg-card/60 text-foreground/90',
};

function SectionBlock({ label, tint, style, text, showAsBytes, testId }: SectionBlockProps) {
    const bytes = showAsBytes ? flattenBytes(charsToBytes(text)).bytes : [];

    return (
        <div className="flex flex-col items-center gap-0.5" data-testid={testId} style={style}>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
                {label}
            </span>
            <div className={cn('rounded border px-2 py-1 text-[11px]', TINT_CLASSES[tint])}>
                {showAsBytes ? (
                    <span className="font-mono tabular-nums" data-testid={`${testId}-bytes`}>
                        {bytes.length > 12
                            ? `${bytes.slice(0, 6).join(' ')} … ${bytes.slice(-3).join(' ')}`
                            : bytes.join(' ')}
                    </span>
                ) : (
                    <span data-testid={`${testId}-text`}>{text}</span>
                )}
            </div>
        </div>
    );
}

export const SCENE_CHAT_TEMPLATE: Scene<PipelineState, PipelineState> = {
    id: 'chat-template',
    durationMs: 2500,
    render: (t, state) => <ChatTemplateScene t={t} promptText={state.promptText ?? ''} />,
    transform: (state) => {
        const systemBytes = flattenBytes(charsToBytes(SYSTEM_PROMPT)).bytes;
        const userMarkerBytes = flattenBytes(charsToBytes(USER_MARKER)).bytes;
        const userPromptBytes = flattenBytes(charsToBytes(state.promptText ?? '')).bytes;
        const assistantMarkerBytes = flattenBytes(charsToBytes(ASSISTANT_MARKER)).bytes;

        const chatTemplateBytes = [
            ...systemBytes,
            ...userMarkerBytes,
            ...userPromptBytes,
            ...assistantMarkerBytes,
        ];
        const chatTemplateTints = [
            ...systemBytes.map(() => 'system' as const),
            ...userMarkerBytes.map(() => 'user' as const),
            ...userPromptBytes.map(() => 'user-prompt' as const),
            ...assistantMarkerBytes.map(() => 'assistant' as const),
        ];

        return { ...state, chatTemplateBytes, chatTemplateTints };
    },
};

export default ChatTemplateScene;
