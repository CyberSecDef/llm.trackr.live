import { VIRIDIS_DOMAIN, VIRIDIS_STOPS } from '@/lib/palettes';

/*
 * Shared color-ramp helper for the M13 cinematic-viz heatmap
 * primitives (VectorStrip, MatrixGrid). Reads from the existing
 * M12-chunk-4 viridis palette so the visual language stays
 * consistent across the M9 AttentionHeatmap + the new M13 scenes.
 *
 * Pure function — no d3 required. Given a normalized value in
 * [0, 1], returns a CSS rgb() string interpolated between the
 * 5 canonical viridis stops.
 *
 * Why inline interpolation instead of `d3-scale`:
 *   - AttentionHeatmap pulls d3-scale via existing chunk imports,
 *     so the cost is paid there anyway. But the cinematic-viz
 *     primitives render hundreds of cells per scene; calling
 *     into a d3 scale per cell at 30 FPS is wasteful.
 *   - The math is one linear interpolation between two adjacent
 *     stops — under 20 lines.
 */

/** Parse `#rrggbb` hex into an RGB tuple. */
function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const VIRIDIS_RGB: ReadonlyArray<readonly [number, number, number]> = VIRIDIS_STOPS.map((s) =>
    hexToRgb(s),
);

/**
 * Map a value in [0, 1] to a viridis rgb() string. Values outside
 * the range are clamped. Linear interpolation between adjacent
 * VIRIDIS_STOPS along VIRIDIS_DOMAIN.
 */
export function viridisAt(t: number): string {
    const clamped = Math.max(0, Math.min(1, t));
    // Find the segment.
    let i = 0;
    while (i < VIRIDIS_DOMAIN.length - 1 && clamped > VIRIDIS_DOMAIN[i + 1]) i++;
    const a = VIRIDIS_DOMAIN[i];
    const b = VIRIDIS_DOMAIN[Math.min(i + 1, VIRIDIS_DOMAIN.length - 1)];
    const span = b - a || 1;
    const local = (clamped - a) / span;
    const [r0, g0, b0] = VIRIDIS_RGB[i];
    const [r1, g1, b1] = VIRIDIS_RGB[Math.min(i + 1, VIRIDIS_RGB.length - 1)];
    const r = Math.round(r0 + (r1 - r0) * local);
    const g = Math.round(g0 + (g1 - g0) * local);
    const bl = Math.round(b0 + (b1 - b0) * local);
    return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Normalize an array of values into [0, 1] using min/max. Returns
 * a parallel array — caller passes the result to `viridisAt` per
 * cell. Both VectorStrip + MatrixGrid use this so the heatmap is
 * always saturation-stretched.
 */
export function normalize(values: readonly number[]): number[] {
    if (values.length === 0) return [];
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const span = max - min || 1;
    return values.map((v) => (v - min) / span);
}
