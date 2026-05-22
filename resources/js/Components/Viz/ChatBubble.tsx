/*
 * ChatBubble (M13 chunk 1 + chunk 10) — bottom-right persistent
 * UI section that mirrors the live token stream.
 *
 * Chunk 1 stubbed the empty bubble outline. Chunk 10 wires it to
 * accept tokens + finality flag from the parent (CinematicViz
 * derives tokens from the WebSocket event stream when available
 * and falls back to PipelineState.generatedTokens otherwise).
 *
 * Per `phase1.md:1032`: "Starts empty; grows as Scene 17 appends
 * each token's string. Driven directly by the real `token.received`
 * WebSocket event so the user sees the response coming in even if
 * the visualization hasn't reached Scene 17 yet for that token."
 *
 * The "ahead-of-viz" property is a key spec beat: the chat bubble
 * can show tokens that the visualization hasn't reached yet. This
 * happens automatically when CinematicViz prefers the events array
 * over the slower scene-transform-driven generatedTokens.
 */

export interface ChatBubbleProps {
    /** Token strings to render, in order. Empty array → placeholder. */
    tokens?: readonly string[];
    /** Whether the run is complete (the final token was the EOS). */
    isFinal?: boolean;
}

export default function ChatBubble({ tokens = [], isFinal = false }: ChatBubbleProps) {
    const concatenated = tokens.join('');
    const hasContent = tokens.length > 0;

    return (
        <div
            className="rounded-lg border border-border bg-card/60 p-3 text-xs"
            role="region"
            aria-label="Streaming output"
            data-testid="viz-chat-bubble"
            data-final={isFinal ? 'true' : 'false'}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="font-medium uppercase tracking-wider text-muted-foreground text-[10px]">
                    Response
                </p>
                {hasContent && (
                    <p
                        className="text-[9px] font-mono tabular-nums text-muted-foreground/60"
                        data-testid="viz-chat-bubble-count"
                    >
                        {tokens.length} tokens
                        {isFinal && ' · complete'}
                    </p>
                )}
            </div>

            {hasContent ? (
                <p
                    className="mt-1 whitespace-pre-wrap break-words text-foreground/90"
                    data-testid="viz-chat-bubble-text"
                >
                    {concatenated}
                    {!isFinal && (
                        <span
                            className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground/60 align-middle"
                            aria-hidden="true"
                            data-testid="viz-chat-bubble-cursor"
                        />
                    )}
                </p>
            ) : (
                <p
                    className="mt-1 italic text-muted-foreground/70"
                    data-testid="viz-chat-bubble-placeholder"
                >
                    Tokens stream in here as the model generates.
                </p>
            )}
        </div>
    );
}
