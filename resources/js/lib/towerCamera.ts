/*
 * towerCamera (M13 chunk 7) — pure phase math for Scene 12's
 * layer-stack tower view. Each function maps the scene's
 * normalized t ∈ [0, 1] to a continuous animation value
 * (packet position on the tower, camera scale, layer counter,
 * blur amount).
 *
 * Five phases, mapped to roughly 1s + 1s + 3s + 3s + 2s within
 * the scene's 10000ms total duration:
 *
 *   reveal  (0.00 .. 0.10): camera zooms out from a single floor
 *                           to the full N-floor tower.
 *   follow  (0.10 .. 0.20): packet ascends floor 1 → floor 2 at
 *                           a calm pace; camera holds at full
 *                           tower view.
 *   blur    (0.20 .. 0.50): packet accelerates through floors 2
 *                           → N-2, layer counter ticks rapidly
 *                           (eased-out, so jumps shrink near the
 *                           top); motion-blur streaks on packet.
 *   slow    (0.50 .. 0.80): packet decelerates onto floors N-1
 *                           and N; counter resumes per-floor.
 *   rezoom  (0.80 .. 1.00): camera zooms into floor N to set up
 *                           the final-layer detail panel.
 *
 * Centralized + tested so the scene code can stay focused on
 * rendering and animation hooks rather than easing curves.
 */

const PHASE_REVEAL_END = 0.1;
const PHASE_FOLLOW_END = 0.2;
const PHASE_BLUR_END = 0.5;
const PHASE_SLOW_END = 0.8;

/** Quadratic ease-out: starts fast, settles slowly. */
export function easeOutQuad(x: number): number {
    const clamped = Math.max(0, Math.min(1, x));
    return 1 - (1 - clamped) * (1 - clamped);
}

/**
 * Continuous packet floor in [1, totalLayers]. Mapped from the
 * scene's t value through the five-phase pipeline above. Returns
 * a non-integer; round / floor at the call site as needed.
 *
 * Edge cases: totalLayers <= 1 → always 1; t <= 0 → 1; t >= 1 →
 * totalLayers.
 */
export function packetFloor(t: number, totalLayers: number): number {
    const N = Math.max(1, Math.floor(totalLayers));
    if (N <= 1) return 1;
    if (t <= 0) return 1;
    if (t >= 1) return N;

    if (t < PHASE_REVEAL_END) {
        // Camera zoom only — packet stays on floor 1.
        return 1;
    }
    if (t < PHASE_FOLLOW_END) {
        // Floor 1 → floor 2, linear.
        const progress = (t - PHASE_REVEAL_END) / (PHASE_FOLLOW_END - PHASE_REVEAL_END);
        return 1 + progress;
    }
    if (t < PHASE_BLUR_END) {
        // Floors 2 → N-2 with easeOutQuad. For small N, clamp the
        // upper bound so this phase still makes visual progress
        // (e.g. N=4 means we land at floor 2, which is fine).
        const progress = (t - PHASE_FOLLOW_END) / (PHASE_BLUR_END - PHASE_FOLLOW_END);
        const eased = easeOutQuad(progress);
        const top = Math.max(2, N - 2);
        return 2 + eased * (top - 2);
    }
    if (t < PHASE_SLOW_END) {
        // Floor N-2 → floor N, linear.
        const progress = (t - PHASE_BLUR_END) / (PHASE_SLOW_END - PHASE_BLUR_END);
        const top = Math.max(2, N - 2);
        return top + progress * (N - top);
    }
    // Re-zoom phase: packet has arrived at floor N.
    return N;
}

/**
 * Camera scale: 1.0 = full tower visible, 4.0 = zoomed in on a
 * single floor, 3.0 = zoomed in on the final layer for the
 * Phase E re-zoom. The scene renders an SVG group with this
 * scale applied so the camera moves are pure CSS / transform.
 */
export function cameraScale(t: number): number {
    if (t <= 0) return 4;
    if (t < PHASE_REVEAL_END) {
        // 4× → 1× across reveal phase.
        const progress = t / PHASE_REVEAL_END;
        return 4 - progress * 3;
    }
    if (t < PHASE_SLOW_END) {
        // Hold at 1× for follow / blur / slow.
        return 1;
    }
    if (t < 1) {
        // 1× → 3× across re-zoom phase.
        const progress = (t - PHASE_SLOW_END) / (1 - PHASE_SLOW_END);
        return 1 + progress * 2;
    }
    return 3;
}

/**
 * Integer layer counter for the in-canvas HUD. Always rounded
 * to the nearest integer of `packetFloor`. Pads to two digits
 * on the caller side via toString().padStart() — keeping the
 * function pure here.
 */
export function counterValue(t: number, totalLayers: number): number {
    return Math.max(1, Math.round(packetFloor(t, totalLayers)));
}

/**
 * Motion-blur amount in [0, 1] for the packet streak during the
 * blur phase. Bell-curve-ish: 0 before/after the blur window, peaks
 * mid-blur. Used as the SVG opacity / Y-stretch driver in the scene.
 */
export function blurAmount(t: number): number {
    if (t <= PHASE_FOLLOW_END || t >= PHASE_BLUR_END) return 0;
    const progress = (t - PHASE_FOLLOW_END) / (PHASE_BLUR_END - PHASE_FOLLOW_END);
    // Symmetric bell: sin²(πx) peaks at 1.0 when x=0.5.
    return Math.sin(progress * Math.PI) ** 2;
}

/**
 * Phase identifier for the scene's per-section UI logic (caption
 * text, detail-panel mounting, etc.). Pure function of t.
 */
export type TowerPhase = 'reveal' | 'follow' | 'blur' | 'slow' | 'rezoom';

export function towerPhase(t: number): TowerPhase {
    if (t < PHASE_REVEAL_END) return 'reveal';
    if (t < PHASE_FOLLOW_END) return 'follow';
    if (t < PHASE_BLUR_END) return 'blur';
    if (t < PHASE_SLOW_END) return 'slow';
    return 'rezoom';
}

/** Exported for tests + the scene component. */
export const TOWER_PHASE_BOUNDARIES = {
    REVEAL_END: PHASE_REVEAL_END,
    FOLLOW_END: PHASE_FOLLOW_END,
    BLUR_END: PHASE_BLUR_END,
    SLOW_END: PHASE_SLOW_END,
} as const;
