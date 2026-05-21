/*
 * ChatBubble (M13) — bottom-right persistent UI section that
 * mirrors the live token stream from the WebSocket.
 *
 * Chunk 1 stub: empty bubble outline. Chunk 10 wires it to the
 * real `useRunStream` events so tokens accumulate in real time
 * regardless of where the visualization currently is in the
 * scene sequence.
 */
export default function ChatBubble() {
    return (
        <div
            className="rounded-lg border border-border bg-card/60 p-3 text-xs"
            role="region"
            aria-label="Streaming output"
            data-testid="viz-chat-bubble"
        >
            <p className="font-medium uppercase tracking-wider text-muted-foreground text-[10px]">
                Response
            </p>
            <p className="mt-1 text-muted-foreground/70 italic">
                Tokens stream in here as the model generates.
            </p>
        </div>
    );
}
