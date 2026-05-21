/*
 * LayerCounterHud (M13) — top-right HUD shown during the
 * layer-stack tower scene (Scene 12) + as an auxiliary mini-map
 * across stage-3 scenes.
 *
 * Chunk 1 stub: empty "Layer — / —" pill. Chunk 7 (tower scene)
 * + chunk 10 (persistent UI wiring) populate it.
 */
export default function LayerCounterHud() {
    return (
        <div
            className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
            role="status"
            aria-label="Layer counter"
            data-testid="viz-layer-counter"
        >
            Layer — / —
        </div>
    );
}
