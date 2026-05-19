import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TransformerStack } from '@/Components/Viz/TransformerStack';

/*
 * TransformerStack — pure Three.js builder, exercised here without
 * a WebGL renderer. We're verifying the geometry layout + material-
 * color state machine, not anything that needs a GL context.
 */

describe('TransformerStack', () => {
    it('builds N slabs for an N-layer model', () => {
        const stack = new TransformerStack({ layerCount: 24 });
        expect(stack.getLayerCount()).toBe(24);
        expect(stack.slabs).toHaveLength(24);
        stack.dispose();
    });

    it('falls back to 12 layers when count is null', () => {
        const stack = new TransformerStack({ layerCount: null });
        expect(stack.getLayerCount()).toBe(12);
        stack.dispose();
    });

    it('falls back to 12 layers when count is undefined', () => {
        const stack = new TransformerStack({ layerCount: undefined });
        expect(stack.getLayerCount()).toBe(12);
        stack.dispose();
    });

    it('clamps non-positive layer counts to 1', () => {
        const stack = new TransformerStack({ layerCount: 0 });
        expect(stack.getLayerCount()).toBe(1);
        stack.dispose();
    });

    it('normalizes total stack height regardless of layer count', () => {
        // Two stacks with very different N should occupy roughly the
        // same vertical span. We measure span as (last Y - first Y).
        const small = new TransformerStack({ layerCount: 12 });
        const large = new TransformerStack({ layerCount: 80 });

        const smallSpan =
            small.slabs[small.slabs.length - 1].position.y - small.slabs[0].position.y;
        const largeSpan =
            large.slabs[large.slabs.length - 1].position.y - large.slabs[0].position.y;

        // Both spans should fit in the same camera frame (4 world units
        // tall in the chunk-1 setup) and be within a small constant of
        // each other.
        expect(smallSpan).toBeLessThan(4);
        expect(largeSpan).toBeLessThan(4);
        expect(Math.abs(smallSpan - largeSpan)).toBeLessThan(0.5);

        small.dispose();
        large.dispose();
    });

    it('centers the stack around y=0', () => {
        const stack = new TransformerStack({ layerCount: 10 });
        // The arithmetic mean of slab Y's should be ~0 for an even N.
        const sum = stack.slabs.reduce((acc, s) => acc + s.position.y, 0);
        expect(Math.abs(sum / stack.slabs.length)).toBeLessThan(0.001);
        stack.dispose();
    });

    it('tags each slab with its layerIndex for raycaster hit-testing', () => {
        const stack = new TransformerStack({ layerCount: 5 });
        for (let i = 0; i < 5; i++) {
            expect(stack.slabs[i].userData.layerIndex).toBe(i);
        }
        stack.dispose();
    });

    it('starts every layer in the base state', () => {
        const stack = new TransformerStack({ layerCount: 4 });
        for (let i = 0; i < 4; i++) {
            expect(stack.getLayerState(i)).toBe('base');
        }
        stack.dispose();
    });

    it('setLayerState swaps the material color', () => {
        const stack = new TransformerStack({ layerCount: 4 });
        const initialHex = (stack.slabs[2].material as THREE.MeshStandardMaterial).color.getHex();

        stack.setLayerState(2, 'active');

        expect(stack.getLayerState(2)).toBe('active');
        const after = (stack.slabs[2].material as THREE.MeshStandardMaterial).color.getHex();
        expect(after).not.toBe(initialHex);
        stack.dispose();
    });

    it('setLayerState is a no-op for out-of-range indices', () => {
        const stack = new TransformerStack({ layerCount: 4 });
        // Should not throw.
        stack.setLayerState(-1, 'active');
        stack.setLayerState(99, 'active');
        // States stay base.
        for (let i = 0; i < 4; i++) {
            expect(stack.getLayerState(i)).toBe('base');
        }
        stack.dispose();
    });

    it('resetAll returns every layer to base', () => {
        const stack = new TransformerStack({ layerCount: 4 });
        stack.setLayerState(0, 'active');
        stack.setLayerState(2, 'selected');
        stack.resetAll();
        for (let i = 0; i < 4; i++) {
            expect(stack.getLayerState(i)).toBe('base');
        }
        stack.dispose();
    });

    it('adds slabs to its Group so the consumer can scene.add(group)', () => {
        const stack = new TransformerStack({ layerCount: 6 });
        expect(stack.group).toBeInstanceOf(THREE.Group);
        expect(stack.group.children).toHaveLength(6);
        for (const child of stack.group.children) {
            expect(child).toBeInstanceOf(THREE.Mesh);
        }
        stack.dispose();
    });
});
