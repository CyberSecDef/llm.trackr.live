/*
 * Color-blind-safe palettes (M12 chunk 4).
 *
 * Two palettes, each backed by published research on perceptual
 * uniformity and color-vision-deficiency safety:
 *
 *   VIRIDIS_STOPS — 5-stop sequential gradient. Used for the
 *     AttentionHeatmap (magnitude → color). Designed by Stefan van
 *     der Walt + Nathaniel Smith for matplotlib 2.0; perceptually
 *     uniform under sRGB and remains monotonic-in-luminance for
 *     deuteranopia, protanopia, and tritanopia.
 *
 *   OKABE_ITO — 7-color categorical palette. Used for
 *     EmbeddingScene cluster identity (each cluster = a hue). Picked
 *     by Masataka Okabe + Kei Ito (2008) specifically so all pairs
 *     remain distinguishable under the three common CVDs. Originally
 *     8 colors including #000000; we use the 7 chromatic stops since
 *     pure black blends into the slate-950 scene background.
 *
 * Why these vs the M8 ad-hoc palette they replace:
 *   - Heatmap's old slate-950 → cyan-300 linear ramp was a one-hue
 *     luminance ramp. Visually pleasant but perceptually non-uniform
 *     (the cyan endpoint compresses too much detail into the high
 *     tail) and offered only one disambiguation axis.
 *   - Cluster palette had two near-duplicate cyans (cyan-200 +
 *     cyan-300) and two near-duplicate ambers (amber-200 +
 *     amber-400) that were hard to distinguish for any viewer, not
 *     just color-blind ones. Okabe-Ito has no such pairs.
 *
 * What we did NOT change:
 *   - MoERouting + LogitsDistribution bars use single-hue magnitude
 *     bars (length encodes the value; color is decorative). Already
 *     CB-safe.
 *   - Status pills (complete/streaming/error) use distinct hues
 *     paired with text labels; CB users disambiguate via the label.
 *     WCAG 2.1 SC 1.4.1 "Use of Color" is satisfied — color is not
 *     the sole information channel.
 */

/** Viridis 5-stop palette in linear order (low → high). */
export const VIRIDIS_STOPS: readonly string[] = [
    '#440154', // dark purple
    '#3b528b', // blue
    '#21918c', // teal
    '#5ec962', // green
    '#fde725', // yellow
] as const;

/** Domain stops paired with VIRIDIS_STOPS for d3-scale `scaleLinear`. */
export const VIRIDIS_DOMAIN: readonly number[] = [0, 0.25, 0.5, 0.75, 1.0] as const;

/*
 * Okabe-Ito 7-color CB-safe categorical palette + 1 high-contrast
 * neutral. The original Okabe-Ito set includes #000000 as the 8th
 * color, but pure black blends into the EmbeddingScene's slate-950
 * background. We swap it for #ffffff (pure white) which:
 *   - has maximum contrast against slate-950,
 *   - is on the lightness axis perpendicular to the 7 chromatic
 *     stops, so it remains distinguishable from any of them under
 *     deuteranopia / protanopia / tritanopia,
 *   - mirrors the academic practice of pairing categorical hues
 *     with a neutral anchor.
 */
export const OKABE_ITO: readonly string[] = [
    '#e69f00', // orange
    '#56b4e9', // sky blue
    '#009e73', // bluish green
    '#f0e442', // yellow
    '#0072b2', // blue
    '#d55e00', // vermillion (reddish orange)
    '#cc79a7', // reddish purple
    '#ffffff', // white (high-contrast neutral; replaces #000000)
] as const;
