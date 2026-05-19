import type { TransformerStack } from '@/Components/Viz/TransformerStack';

/*
 * CascadeController (M8 chunk 3).
 *
 * Drives the per-token "layer cascade" animation on the
 * transformer stack. Each `layer.advanced` broadcast event
 * (one per generated token) spawns a wave that walks from
 * the bottom layer to the top over CASCADE_DURATION_MS;
 * during the walk the head layer is rendered `active`.
 *
 * Waves are not queued — they overlap. A model generating
 * 30 tok/s with a 600ms cascade produces ~18 concurrent
 * waves at peak; the animation reads as a "scrolling band"
 * up the stack rather than a single head bouncing.
 *
 * Owning lifecycle: caller constructs with a stack, calls
 * pushWave() per event, calls update(deltaMs) every frame,
 * and reset() between runs.
 */

const CASCADE_DURATION_MS = 600;

interface Wave {
    /** Controller-relative start time, in ms. */
    startMs: number;
}

export class CascadeController {
    private waves: Wave[] = [];
    /** Monotonic clock kept on the controller — independent of wall
     * time so tests can advance it deterministically. */
    private elapsedMs = 0;

    constructor(private readonly stack: TransformerStack) {}

    /** Start a new cascade wave (one per `layer.advanced` event). */
    pushWave(): void {
        this.waves.push({ startMs: this.elapsedMs });
    }

    /**
     * Advance the controller by deltaMs (frame delta from the
     * animation loop) and repaint the stack's layer states.
     * Idempotent for deltaMs=0.
     */
    update(deltaMs: number): void {
        this.elapsedMs += deltaMs;

        // Drop waves whose head has walked past the top layer.
        this.waves = this.waves.filter((w) => this.elapsedMs - w.startMs <= CASCADE_DURATION_MS);

        this.stack.resetAll();

        const n = this.stack.getLayerCount();
        for (const wave of this.waves) {
            const progress = (this.elapsedMs - wave.startMs) / CASCADE_DURATION_MS;
            // floor so the head lands on a discrete layer; clamp so a
            // wave at progress=1.0 (about to expire) stays on the top.
            const head = Math.min(n - 1, Math.max(0, Math.floor(progress * n)));
            this.stack.setLayerState(head, 'active');
        }
    }

    /** Clear all waves and reset the stack. Use between runs. */
    reset(): void {
        this.waves = [];
        this.stack.resetAll();
    }

    /** Test-helper — number of in-flight waves. */
    activeWaveCount(): number {
        return this.waves.length;
    }
}
