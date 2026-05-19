import * as THREE from 'three';

/*
 * TransformerStack (M8 chunk 2).
 *
 * Pure Three.js builder for the N-layer transformer stack rendered
 * in the right-pane viz. Each layer is a thin slab; the whole stack
 * is normalized to a fixed world-space height so the viewport never
 * needs to re-fit between a 12-layer model and an 80-layer one.
 *
 * The class deliberately knows nothing about React or animation
 * timing — chunk 3 layers a cascade controller on top, chunk 4 a
 * click-to-zoom controller. This keeps the geometry/material
 * lifecycle separate from event-stream consumption.
 *
 * State model: each slab has one of four states (base / active /
 * hover / selected). State changes are immediate color swaps (no
 * tween); the consumer drives any easing they want by calling
 * setLayerState on a schedule.
 */

export type LayerState = 'base' | 'active' | 'hover' | 'selected';

const COLORS: Record<LayerState, number> = {
    // Mirrors the dark-theme palette so slabs read as a stack of
    // CPU-cache-ish blocks in the resting state, then light up
    // indigo / amber on activity.
    base: 0x334155, // slate-700
    active: 0x4f46e5, // indigo-600 (matches the chunk-1 placeholder)
    hover: 0x60a5fa, // blue-400
    selected: 0xf59e0b, // amber-500
};

const TOTAL_HEIGHT = 4; // World units — fits the (3,3,6) camera frame from chunk 1.
const SLAB_WIDTH = 1.6;
const SLAB_DEPTH = 1.6;
const GAP_RATIO = 0.15; // 15% of each layer's slot is gap above it.

export interface TransformerStackOptions {
    /** Layer count from the run's model snapshot. Falls back to 12 if null/undefined. */
    layerCount: number | null | undefined;
}

export class TransformerStack {
    readonly group: THREE.Group;
    readonly slabs: THREE.Mesh[];
    private readonly materials: THREE.MeshStandardMaterial[];
    private readonly geometry: THREE.BoxGeometry;
    private readonly states: LayerState[];

    constructor(options: TransformerStackOptions) {
        const n = Math.max(1, options.layerCount ?? 12);

        this.group = new THREE.Group();
        this.slabs = [];
        this.materials = [];
        this.states = [];

        // One slot per layer. Each slot is (TOTAL_HEIGHT / n) tall; the
        // slab fills (1 - GAP_RATIO) of the slot, the gap fills the rest.
        const slotHeight = TOTAL_HEIGHT / n;
        const slabHeight = slotHeight * (1 - GAP_RATIO);
        const startY = -TOTAL_HEIGHT / 2 + slotHeight / 2;

        // Geometry is shared — slabs differ only in material color
        // and Y position. One geometry dispose at teardown.
        this.geometry = new THREE.BoxGeometry(SLAB_WIDTH, slabHeight, SLAB_DEPTH);

        for (let i = 0; i < n; i++) {
            const material = new THREE.MeshStandardMaterial({
                color: COLORS.base,
                metalness: 0.1,
                roughness: 0.55,
            });
            const slab = new THREE.Mesh(this.geometry, material);
            slab.position.y = startY + i * slotHeight;
            // Layer index lives on the mesh for raycaster-based hit-
            // testing in chunk 4 (click-to-zoom).
            slab.userData.layerIndex = i;
            this.group.add(slab);
            this.slabs.push(slab);
            this.materials.push(material);
            this.states.push('base');
        }
    }

    getLayerCount(): number {
        return this.slabs.length;
    }

    getLayerState(index: number): LayerState | null {
        return this.states[index] ?? null;
    }

    setLayerState(index: number, state: LayerState): void {
        if (index < 0 || index >= this.materials.length) return;
        this.states[index] = state;
        this.materials[index].color.setHex(COLORS[state]);
    }

    /** Reset every slab to `base`. Useful between runs. */
    resetAll(): void {
        for (let i = 0; i < this.materials.length; i++) {
            this.states[i] = 'base';
            this.materials[i].color.setHex(COLORS.base);
        }
    }

    dispose(): void {
        this.geometry.dispose();
        for (const m of this.materials) m.dispose();
    }
}
