import { describe, expect, it } from 'vitest';
import { CascadeController } from '@/Components/Viz/CascadeController';
import { TransformerStack } from '@/Components/Viz/TransformerStack';

/*
 * CascadeController — exercised against a real TransformerStack so
 * we verify the *visible* end-state (slab colors) rather than a
 * mock's call log. The stack runs without a renderer because we
 * never call into WebGL.
 */

function findActiveLayers(stack: TransformerStack): number[] {
    const active: number[] = [];
    for (let i = 0; i < stack.getLayerCount(); i++) {
        if (stack.getLayerState(i) === 'active') active.push(i);
    }
    return active;
}

describe('CascadeController', () => {
    it('starts with no active waves and a base-state stack', () => {
        const stack = new TransformerStack({ layerCount: 12 });
        const controller = new CascadeController(stack);
        controller.update(0);
        expect(controller.activeWaveCount()).toBe(0);
        expect(findActiveLayers(stack)).toEqual([]);
        stack.dispose();
    });

    it('a single wave walks the head from layer 0 toward layer N-1', () => {
        const stack = new TransformerStack({ layerCount: 12 });
        const controller = new CascadeController(stack);

        controller.pushWave();
        controller.update(0);
        expect(findActiveLayers(stack)).toEqual([0]);

        // Halfway through the cascade duration — head should be near
        // the middle.
        controller.update(300);
        const mid = findActiveLayers(stack);
        expect(mid).toHaveLength(1);
        expect(mid[0]).toBeGreaterThan(0);
        expect(mid[0]).toBeLessThan(stack.getLayerCount() - 1);

        stack.dispose();
    });

    it('drops a wave once it walks past the top', () => {
        const stack = new TransformerStack({ layerCount: 12 });
        const controller = new CascadeController(stack);

        controller.pushWave();
        // Advance well past CASCADE_DURATION_MS (600ms).
        controller.update(700);
        expect(controller.activeWaveCount()).toBe(0);
        expect(findActiveLayers(stack)).toEqual([]);

        stack.dispose();
    });

    it('multiple overlapping waves light multiple layers', () => {
        const stack = new TransformerStack({ layerCount: 20 });
        const controller = new CascadeController(stack);

        controller.pushWave();
        controller.update(200);
        controller.pushWave();
        controller.update(0);

        const active = findActiveLayers(stack);
        expect(active.length).toBeGreaterThanOrEqual(2);
        // The older wave's head should be above the new one's head.
        expect(active[active.length - 1]).toBeGreaterThan(active[0]);

        stack.dispose();
    });

    it('reset() clears all waves and resets every slab to base', () => {
        const stack = new TransformerStack({ layerCount: 8 });
        const controller = new CascadeController(stack);

        controller.pushWave();
        controller.update(100);
        controller.pushWave();
        controller.update(50);
        expect(controller.activeWaveCount()).toBeGreaterThan(0);

        controller.reset();
        expect(controller.activeWaveCount()).toBe(0);
        for (let i = 0; i < stack.getLayerCount(); i++) {
            expect(stack.getLayerState(i)).toBe('base');
        }
        stack.dispose();
    });

    it('handles a small stack (1 layer) without out-of-range writes', () => {
        const stack = new TransformerStack({ layerCount: 1 });
        const controller = new CascadeController(stack);
        controller.pushWave();
        controller.update(0);
        controller.update(300);
        controller.update(300);
        // Nothing should throw; final state may be empty (wave expired)
        // or [0]. Either is fine — we're just checking no out-of-range.
        stack.dispose();
    });

    it('handles a tall stack (80 layers) — head reaches the top before expiry', () => {
        const stack = new TransformerStack({ layerCount: 80 });
        const controller = new CascadeController(stack);

        controller.pushWave();
        controller.update(0);
        expect(findActiveLayers(stack)).toEqual([0]);

        // Near the end of the cascade window.
        controller.update(590);
        const nearEnd = findActiveLayers(stack);
        expect(nearEnd).toHaveLength(1);
        expect(nearEnd[0]).toBeGreaterThan(70);

        stack.dispose();
    });
});
