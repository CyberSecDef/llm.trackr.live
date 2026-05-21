import { normalize, viridisAt } from '@/lib/vizColors';

/*
 * MatrixGrid (M13 chunk 2) — 2D heatmap representing a matrix
 * (attention scores, embedding table, LM-head projection slice).
 *
 * Per `docs/visualization.md` visual language: "Matrices = 2D
 * heatmap grids." Same viridis ramp as VectorStrip for visual
 * coherence across the pipeline.
 *
 * When the underlying matrix exceeds `maxVisible` on either axis,
 * we render the top-left `maxVisible × maxVisible` corner + a
 * fade-out edge so the user knows the implied extent. The
 * aria-label spells out "showing R of total_rows × C of
 * total_cols" so screen-reader users get the full picture.
 */

export interface MatrixGridProps {
    /** The matrix as values[row][col]. Ragged rows are clamped to the shortest row. */
    values: readonly (readonly number[])[];
    /** Total rows (if values is pre-sliced). Drives the aria-label. */
    totalRows?: number;
    /** Total cols (if values is pre-sliced). Drives the aria-label. */
    totalCols?: number;
    /** Max visible cells per axis. Default 32. */
    maxVisible?: number;
    /** Pixel size of the (square) SVG. */
    size?: number;
    /** Caption above the grid. */
    caption?: string;
}

export default function MatrixGrid({
    values,
    totalRows,
    totalCols,
    maxVisible = 32,
    size = 200,
    caption,
}: MatrixGridProps) {
    const rawRows = values.length;
    const rawCols = rawRows > 0 ? Math.min(...values.map((r) => r.length)) : 0;
    const visibleRows = Math.min(rawRows, maxVisible);
    const visibleCols = Math.min(rawCols, maxVisible);
    const fullRows = totalRows ?? rawRows;
    const fullCols = totalCols ?? rawCols;
    const truncated = fullRows > visibleRows || fullCols > visibleCols;

    // Flatten the visible slice for min/max + viridisAt mapping.
    const flat: number[] = [];
    for (let r = 0; r < visibleRows; r++) {
        for (let c = 0; c < visibleCols; c++) {
            flat.push(values[r][c]);
        }
    }
    const normFlat = normalize(flat);

    // Reserve a 6px right + bottom fade band when truncated so the
    // implied extent is visible in the rendered SVG.
    const drawableSize = truncated ? size - 6 : size;
    const cellPx = visibleCols > 0 ? drawableSize / visibleCols : 0;

    const ariaLabel = truncated
        ? `Matrix heatmap, showing ${visibleRows}×${visibleCols} of ${fullRows}×${fullCols}, viridis palette`
        : `Matrix heatmap, ${visibleRows}×${visibleCols}, viridis palette`;

    return (
        <div className="space-y-0.5" data-testid="matrix-grid">
            {caption && (
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {caption}
                </p>
            )}
            <svg
                width={size}
                height={size}
                role="img"
                aria-label={ariaLabel}
                className="block rounded-sm border border-border bg-slate-950"
                data-testid="matrix-grid-svg"
                data-visible-rows={visibleRows}
                data-visible-cols={visibleCols}
                data-total-rows={fullRows}
                data-total-cols={fullCols}
            >
                {Array.from({ length: visibleRows }, (_, r) =>
                    Array.from({ length: visibleCols }, (_, c) => {
                        const v = normFlat[r * visibleCols + c];
                        return (
                            <rect
                                key={`${r}-${c}`}
                                x={c * cellPx}
                                y={r * cellPx}
                                width={cellPx + 0.5}
                                height={cellPx + 0.5}
                                fill={viridisAt(v)}
                                data-testid={`matrix-grid-cell-${r}-${c}`}
                            />
                        );
                    }),
                )}
                {truncated && (
                    // Bottom-right "…" tile cue
                    <text
                        x={size - 3}
                        y={size - 1}
                        textAnchor="end"
                        className="fill-muted-foreground"
                        fontSize={8}
                        fontFamily="monospace"
                        data-testid="matrix-grid-truncation"
                    >
                        …
                    </text>
                )}
            </svg>
        </div>
    );
}
