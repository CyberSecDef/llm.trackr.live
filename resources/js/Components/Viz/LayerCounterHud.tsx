/*
 * LayerCounterHud (M13) — top-right persistent UI section showing
 * "Layer N / M" + a tower progress mini-bar during the stage-3
 * scenes (5-12).
 *
 * Chunk 1 stubbed it as "Layer — / —". Chunk 7 built the in-canvas
 * tower view with its own counter. Chunk 10 wires this persistent
 * HUD: visible during scenes 5-12 with currentLayer + totalLayers
 * sourced from PipelineState + scene index. Auto-hides outside that
 * range so it doesn't clutter the prompt-entry / detokenize beats.
 *
 * Per `phase1.md:1033`: "integer counter + tower progress mini-bar.
 * Visible during scenes 5-12. Auto-hides during scenes 0-4 + 13-20."
 */

import { cn } from '@/lib/utils';

export interface LayerCounterHudProps {
    /** Active layer (1-indexed). Null/undefined renders the dash
     *  placeholder. */
    currentLayer?: number | null;
    /** Total layer count (typically 32). Null/undefined renders dash. */
    totalLayers?: number | null;
    /** Whether the HUD is visible. False auto-hides the pill so
     *  scenes 0-4 + 13-20 don't show layer info. */
    visible?: boolean;
}

export default function LayerCounterHud({
    currentLayer = null,
    totalLayers = null,
    visible = false,
}: LayerCounterHudProps) {
    const hasData = currentLayer !== null && totalLayers !== null;
    const layerLabel = hasData
        ? `${String(currentLayer).padStart(2, '0')} / ${String(totalLayers).padStart(2, '0')}`
        : '— / —';
    const progressPct = hasData
        ? Math.max(0, Math.min(1, (currentLayer! - 1) / Math.max(1, totalLayers! - 1)))
        : 0;

    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground transition-opacity',
                visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            role="status"
            aria-label={
                hasData && visible ? `Layer ${currentLayer} of ${totalLayers}` : 'Layer counter'
            }
            aria-hidden={!visible || undefined}
            data-testid="viz-layer-counter"
            data-visible={visible ? 'true' : 'false'}
        >
            <span className="uppercase tracking-wider text-muted-foreground/70">Layer</span>
            <span className="tabular-nums text-foreground" data-testid="viz-layer-counter-value">
                {layerLabel}
            </span>
            {hasData && (
                <span
                    className="block h-1 w-12 overflow-hidden rounded-full bg-card/40"
                    aria-hidden="true"
                >
                    <span
                        className="block h-full bg-cyan-400"
                        style={{ width: `${progressPct * 100}%` }}
                        data-testid="viz-layer-counter-progress"
                    />
                </span>
            )}
        </div>
    );
}
