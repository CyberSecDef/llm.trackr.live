import { useMemo } from 'react';
import { max } from 'd3-array';
import { scaleLinear } from 'd3-scale';

/*
 * AttentionHeatmap (M8 chunk 5a) — N×N SVG grid colored by weight.
 *
 * Rendered inside the click-to-zoom layer-detail overlay. Receives
 * a pre-computed matrix (see `lib/attentionPattern.ts`) so the
 * component stays a pure presenter — no synthesis logic here, no
 * coupling to the event stream.
 *
 * Color scale: linear from slate-950 (`#020617`) → cyan-300
 * (`#67e8f9`) — the same accent color the chunk-3 particles use,
 * which keeps the palette coherent across viz components.
 *
 * SVG was chosen over Canvas because the matrices we render are
 * capped at ~32×32 in the overlay (the caller slices the tail of
 * the active token stream). 1024 rects is well under the SVG-
 * performance cliff and gives us inspectable / a11y-friendly DOM.
 */

interface AttentionHeatmapProps {
    /** Square matrix from generateAttentionPattern. */
    matrix: number[][];
    /** SVG pixel size (square). Default fits the chunk-2 overlay. */
    size?: number;
    /** Caption rendered above the grid (e.g. "Attention · layer 5"). */
    caption?: string;
}

const COLOR_LOW = '#020617'; // slate-950
const COLOR_HIGH = '#67e8f9'; // cyan-300

export default function AttentionHeatmap({ matrix, size = 220, caption }: AttentionHeatmapProps) {
    const n = matrix.length;
    const colorScale = useMemo(() => {
        const flat = matrix.flat();
        const m = max(flat) ?? 1;
        // Domain max defaults to 1.0 for tiny matrices where the
        // largest cell is < 1; using the real max would over-
        // saturate trivial inputs.
        return scaleLinear<string>()
            .domain([0, Math.max(m, 1e-6)])
            .range([COLOR_LOW, COLOR_HIGH])
            .clamp(true);
    }, [matrix]);

    if (n === 0) return null;
    const cell = size / n;

    return (
        <div className="space-y-1" data-testid="attention-heatmap-container">
            {caption && (
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {caption}
                </p>
            )}
            <svg
                width={size}
                height={size}
                role="img"
                aria-label="Attention heatmap (illustrative)"
                data-testid="attention-heatmap"
                className="rounded-sm border border-border bg-slate-950"
            >
                {matrix.map((row, i) =>
                    row.map((v, j) => (
                        <rect
                            key={`${i}-${j}`}
                            x={j * cell}
                            y={i * cell}
                            width={cell}
                            height={cell}
                            fill={colorScale(v)}
                            data-testid={`heatmap-cell-${i}-${j}`}
                        />
                    )),
                )}
            </svg>
            <p
                className="text-[9px] italic text-muted-foreground/70"
                data-testid="heatmap-illustrative-note"
            >
                Illustrative — vendor APIs don&apos;t expose attention.
            </p>
        </div>
    );
}
