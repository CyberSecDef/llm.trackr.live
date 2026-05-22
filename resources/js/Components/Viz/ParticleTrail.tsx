import { tokenIdToHue } from '@/Components/Viz/TokenPill';
import { usePerformanceMode } from '@/Components/Viz/PerformanceModeContext';
import { cn } from '@/lib/utils';

/*
 * ParticleTrail (M13 chunk 2) — a single colored pulse traveling
 * along a straight or curved path between two anchor points.
 *
 * Per `docs/visualization.md` visual language: "Active computation
 * = bright, animated, with traveling particles or pulses along
 * data paths." This is the "pulses" half; chunks 8-10 layer many
 * of these to make the attention-arc / FFN-pipe / KV-cache-fill
 * sequences read as data flowing.
 *
 * Implementation choice: SVG `<line>` + `<circle>` with CSS
 * keyframes. Per user direction (chunk-2 pre-discussion):
 *   - Standalone in the DOM; no Three.js scene required.
 *   - Composes anywhere two anchor pixels are known.
 *   - 50+ simultaneous trails at 60 FPS in Chromium/Firefox.
 *   - When a scene needs many thousands of particles, a future
 *     <GpuParticleSwarm> Three.js component can land — but the
 *     SVG trail covers every named scene in
 *     `docs/visualization.md`.
 *
 * Reduced motion: gated via `motion-safe:` per the M12 chunk-3
 * pattern. When reduced-motion is set, the trail renders as a
 * static line + dot at the destination — communicates the data-
 * flow direction without the animation.
 *
 * The pulse dot's hue is derived from `colorFromHash` via the
 * same `tokenIdToHue` xorshift32 used by TokenPill, so a trail
 * carrying token T can color-match the source pill.
 */

export interface ParticleTrailProps {
    /** Anchor pixel where the pulse starts. */
    from: { x: number; y: number };
    /** Anchor pixel where the pulse arrives. */
    to: { x: number; y: number };
    /** Integer hash → hue. Defaults to a neutral cyan when unspecified. */
    colorFromHash?: number;
    /** Trail duration in ms. Default 800. */
    durationMs?: number;
    /** Width + height of the wrapping SVG. Must encompass from + to. */
    width: number;
    /** Height of the wrapping SVG. */
    height: number;
    /** Strokes the static guide line behind the pulse when true. Default true. */
    showGuideLine?: boolean;
    className?: string;
}

const HASH_TO_COLOR_NEUTRAL = 'hsl(190deg 65% 55%)'; // cyan-ish default

export default function ParticleTrail({
    from,
    to,
    colorFromHash,
    durationMs = 800,
    width,
    height,
    showGuideLine = true,
    className,
}: ParticleTrailProps) {
    const color =
        colorFromHash !== undefined
            ? `hsl(${tokenIdToHue(colorFromHash)}deg 65% 60%)`
            : HASH_TO_COLOR_NEUTRAL;

    // M13 chunk 12: degraded mode skips the CSS animation and just
    // renders the guide line + a static destination dot. The
    // motion-safe class is also already gating this under
    // prefers-reduced-motion, but the degraded mode is independent
    // (FPS-driven, not preference-driven).
    const { degraded } = usePerformanceMode();

    // Inline CSS animation so the keyframes name is unique per
    // mount (avoids cross-component collisions on the global
    // stylesheet) and `durationMs` plumbs through cleanly.
    const animName = `particle-trail-${from.x}-${from.y}-${to.x}-${to.y}`;
    const animStyle = `
        @keyframes ${animName} {
            0% {
                cx: ${from.x}px;
                cy: ${from.y}px;
                opacity: 0;
            }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% {
                cx: ${to.x}px;
                cy: ${to.y}px;
                opacity: 0;
            }
        }
    `;

    return (
        <svg
            width={width}
            height={height}
            role="presentation"
            aria-hidden="true"
            className={cn('pointer-events-none', className)}
            data-testid="particle-trail"
            data-from-x={from.x}
            data-from-y={from.y}
            data-to-x={to.x}
            data-to-y={to.y}
        >
            <style>{animStyle}</style>
            {showGuideLine && (
                <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={color}
                    strokeWidth={0.5}
                    strokeDasharray="2 3"
                    opacity={0.35}
                    data-testid="particle-trail-guide"
                />
            )}
            <circle
                cx={to.x}
                cy={to.y}
                r={3}
                fill={color}
                className={degraded ? undefined : 'motion-safe:[animation:var(--anim)]'}
                style={
                    degraded
                        ? undefined
                        : ({
                              '--anim': `${animName} ${durationMs}ms linear infinite`,
                          } as React.CSSProperties)
                }
                data-testid="particle-trail-pulse"
                data-degraded={degraded ? 'true' : 'false'}
            />
        </svg>
    );
}
