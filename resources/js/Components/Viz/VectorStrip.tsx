import { normalize, viridisAt } from '@/lib/vizColors';
import { useVectorInspection } from '@/Components/Viz/VectorInspectionContext';
import { usePerformanceMode } from '@/Components/Viz/PerformanceModeContext';

/*
 * VectorStrip (M13 chunk 2 + chunk 11b) — 1D horizontal heatmap
 * representing a single vector (token embedding, hidden state,
 * logits row, etc.)
 *
 * Per `docs/visualization.md` visual language: "Vectors =
 * horizontal bars or 1D heatmap strips (each cell a color from a
 * magma/viridis ramp based on value)."
 *
 * Chunk 11b: when wrapped in a `<VectorInspectionProvider>`, the
 * strip becomes clickable — opening the `<NumericalValuesPanel>`
 * with this strip's full values. Outside a provider the strip
 * stays non-interactive (the chunk-2 behaviour).
 *
 * Implementation:
 *   - SVG with one <rect> per visible cell
 *   - Viridis ramp from the M12 chunk-4 palette (CB-safe under
 *     deuteranopia / protanopia / tritanopia)
 *   - When `values.length > visibleCells`, trailing `…` indicator
 *     in the last 8 px so the user knows the full dim is wider.
 *     The "implied" extent is communicated via `aria-label` so
 *     screen-reader users hear "showing 128 of 4096 cells."
 *   - role="img" + aria-label per the M12 chunk-3 viz-aria pattern.
 */

export interface VectorStripProps {
    /** The full vector. We slice to `visibleCells` for rendering. */
    values: readonly number[];
    /** Max cells to render. Default 128 — beyond which the strip
     *  gets too dense to read. */
    visibleCells?: number;
    /** Full vector length (if it exceeds `values.length` — e.g.
     *  the caller pre-sliced). Drives the "showing N of M" text. */
    totalLength?: number;
    /** Pixel height of the strip. */
    height?: number;
    /** Pixel width of the strip. Cells share this evenly. */
    width?: number;
    /** Caption above the strip; not announced via aria-label. */
    caption?: string;
    /** Optional label passed to the inspection panel when clicked.
     *  When omitted, the panel falls back to the caption (if any)
     *  then to "Unnamed vector". */
    inspectionLabel?: string;
}

export default function VectorStrip({
    values,
    visibleCells = 128,
    totalLength,
    height = 16,
    width = 320,
    caption,
    inspectionLabel,
}: VectorStripProps) {
    const fullLength = totalLength ?? values.length;
    // M13 chunk 12: clamp visible cells to 64 in degraded mode so
    // long strips render half as many SVG rects per frame.
    const { degraded } = usePerformanceMode();
    const effectiveVisibleCells = degraded ? Math.min(visibleCells, 64) : visibleCells;
    const slice = values.slice(0, effectiveVisibleCells);
    const truncated = fullLength > slice.length;
    const normalized = normalize(slice);
    // Reserve 12 px for the trailing "…" indicator when truncated.
    const drawableWidth = truncated ? width - 12 : width;
    const cellWidth = slice.length > 0 ? drawableWidth / slice.length : 0;

    const ariaLabel = truncated
        ? `Vector heatmap, showing ${slice.length} of ${fullLength} cells, viridis palette`
        : `Vector heatmap, ${slice.length} cells, viridis palette`;

    const inspection = useVectorInspection();
    const isInspectable = inspection !== null && values.length > 0;
    const onClick = isInspectable
        ? () => inspection!.open(values, inspectionLabel ?? caption ?? 'Unnamed vector')
        : undefined;

    return (
        <div className="space-y-0.5" data-testid="vector-strip">
            {caption && (
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {caption}
                </p>
            )}
            <svg
                width={width}
                height={height}
                role={isInspectable ? 'button' : 'img'}
                aria-label={
                    isInspectable ? `${ariaLabel}. Click to inspect numerical values.` : ariaLabel
                }
                tabIndex={isInspectable ? 0 : undefined}
                onClick={onClick}
                onKeyDown={
                    isInspectable
                        ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onClick?.();
                              }
                          }
                        : undefined
                }
                className={`block rounded-sm border border-border bg-slate-950 ${
                    isInspectable
                        ? 'cursor-pointer transition-shadow hover:shadow-[0_0_0_2px_rgba(103,232,249,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                        : ''
                }`}
                data-testid="vector-strip-svg"
                data-visible-cells={slice.length}
                data-total-length={fullLength}
                data-inspectable={isInspectable ? 'true' : 'false'}
            >
                {normalized.map((v, i) => (
                    <rect
                        key={i}
                        x={i * cellWidth}
                        y={0}
                        width={cellWidth + 0.5 /* +0.5 to suppress sub-pixel seams */}
                        height={height}
                        fill={viridisAt(v)}
                        data-testid={`vector-strip-cell-${i}`}
                    />
                ))}
                {truncated && (
                    <text
                        x={width - 6}
                        y={height / 2 + 3}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        fontSize={9}
                        fontFamily="monospace"
                        data-testid="vector-strip-truncation"
                    >
                        …
                    </text>
                )}
            </svg>
        </div>
    );
}
