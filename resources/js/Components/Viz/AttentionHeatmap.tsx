import { useMemo } from 'react';
import { max } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { VIRIDIS_DOMAIN, VIRIDIS_STOPS } from '@/lib/palettes';

/*
 * AttentionHeatmap (M8 chunk 5a) — N×N SVG grid colored by weight.
 *
 * Rendered inside the click-to-zoom layer-detail overlay. Receives
 * a pre-computed matrix (see `lib/attentionPattern.ts`) so the
 * component stays a pure presenter — no synthesis logic here, no
 * coupling to the event stream.
 *
 * Color scale: viridis (M12 chunk 4) — 5-stop perceptually-uniform
 * sequential palette, CB-safe under deuteranopia / protanopia /
 * tritanopia. Picked over the M8 ad-hoc slate→cyan ramp because
 * viridis preserves perceptual ordering for color-blind users
 * AND non-CB users get a much more readable distribution (the
 * old single-hue ramp compressed the top tail into a single cyan).
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

export default function AttentionHeatmap({ matrix, size = 220, caption }: AttentionHeatmapProps) {
    const n = matrix.length;
    const colorScale = useMemo(() => {
        const flat = matrix.flat();
        const m = max(flat) ?? 1;
        // Domain max defaults to 1.0 for tiny matrices where the
        // largest cell is < 1; using the real max would over-
        // saturate trivial inputs. The 5-stop viridis range is
        // mapped across [0, max] via d3 multi-stop interpolation.
        const maxVal = Math.max(m, 1e-6);
        return scaleLinear<string>()
            .domain(VIRIDIS_DOMAIN.map((d) => d * maxVal))
            .range([...VIRIDIS_STOPS])
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
                aria-label="Attention heatmap (illustrative, viridis palette)"
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
