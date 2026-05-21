/*
 * WeightFog (M13 chunk 2) — the "always-there-in-the-background"
 * weight texture per `docs/visualization.md` visual language:
 * "Weights/parameters = dimmed gray, 'always there in the
 * background'."
 *
 * Used by scenes 5 (embedding lookup) + 8 (multi-head attention)
 * + 14 (LM head) to communicate "this huge parameter matrix exists
 * behind the scene; the active computation is what's bright." We
 * render it as a low-contrast SVG dot grid so it reads as
 * "background fabric" rather than as a layer the user should
 * actively interpret.
 *
 * Implementation: a single SVG `<pattern>` of small circles tiled
 * across the bounds. Inert (no animation, no interaction). Cheap
 * to render at any size; the SVG-as-pattern is GPU-composited by
 * the browser.
 *
 * Accessibility: `role="presentation"` + `aria-hidden="true"`. The
 * fog carries no semantic information; assistive tech should skip
 * it entirely.
 */

export interface WeightFogProps {
    width: number;
    height: number;
    /** Optional dot density (px between dots). Default 12. */
    density?: number;
    /** Optional override className for the wrapping `<svg>`. */
    className?: string;
}

export default function WeightFog({ width, height, density = 12, className }: WeightFogProps) {
    // Stable pattern id derived from props so multiple WeightFog
    // mounts on the same page don't collide on the `<defs>` id.
    const patternId = `weight-fog-pattern-${width}x${height}-${density}`;

    return (
        <svg
            width={width}
            height={height}
            role="presentation"
            aria-hidden="true"
            className={className}
            data-testid="weight-fog"
            data-density={density}
        >
            <defs>
                <pattern
                    id={patternId}
                    x={0}
                    y={0}
                    width={density}
                    height={density}
                    patternUnits="userSpaceOnUse"
                >
                    <circle
                        cx={density / 2}
                        cy={density / 2}
                        r={0.6}
                        fill="currentColor"
                        opacity={0.18}
                    />
                </pattern>
            </defs>
            <rect
                width={width}
                height={height}
                fill={`url(#${patternId})`}
                className="text-muted-foreground"
            />
        </svg>
    );
}
