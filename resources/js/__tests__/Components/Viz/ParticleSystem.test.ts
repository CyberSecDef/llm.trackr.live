import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ParticleSystem } from '@/Components/Viz/ParticleSystem';

/*
 * ParticleSystem — exercised without a WebGL renderer. The class is
 * pure Three.js scene-graph + per-frame state, so jsdom is fine.
 * We verify pool semantics, kinematics, lifecycle, and reset.
 *
 * Spawn jitter uses an injected RNG so positions are deterministic.
 */

function fixedRng(values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length];
}

describe('ParticleSystem', () => {
    it('starts with all particles inactive', () => {
        const ps = new ParticleSystem({ maxParticles: 16 });
        expect(ps.activeCount()).toBe(0);
        ps.dispose();
    });

    it('builds an InstancedMesh sized to the pool', () => {
        const ps = new ParticleSystem({ maxParticles: 64 });
        expect(ps.mesh).toBeInstanceOf(THREE.InstancedMesh);
        expect(ps.mesh.count).toBe(64);
        ps.dispose();
    });

    it('spawnBurst activates up to count particles', () => {
        const ps = new ParticleSystem({ maxParticles: 16 });
        const spawned = ps.spawnBurst(7);
        expect(spawned).toBe(7);
        expect(ps.activeCount()).toBe(7);
        ps.dispose();
    });

    it('spawnBurst caps at the pool size', () => {
        const ps = new ParticleSystem({ maxParticles: 4 });
        const spawned = ps.spawnBurst(10);
        expect(spawned).toBe(4);
        expect(ps.activeCount()).toBe(4);
        ps.dispose();
    });

    it('spawns particles at Y_BOTTOM (-2)', () => {
        const ps = new ParticleSystem({ maxParticles: 4, random: fixedRng([0.5]) });
        ps.spawnBurst(2);
        ps.update(0);
        const m = new THREE.Matrix4();
        ps.mesh.getMatrixAt(0, m);
        const pos = new THREE.Vector3();
        pos.setFromMatrixPosition(m);
        expect(pos.y).toBeCloseTo(-2, 5);
        ps.dispose();
    });

    it('jitters X/Z within ±0.6 of center', () => {
        // RNG yielding [0, 1, 0.5] cycles to give extreme + midpoint
        // positions. Verifies the (random - 0.5) * 2 * RANGE formula.
        const ps = new ParticleSystem({
            maxParticles: 4,
            random: fixedRng([0, 1, 0.5, 0]),
        });
        ps.spawnBurst(2);
        ps.update(0);
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();

        ps.mesh.getMatrixAt(0, m);
        pos.setFromMatrixPosition(m);
        expect(pos.x).toBeCloseTo(-0.6, 5);
        expect(pos.z).toBeCloseTo(0.6, 5);

        ps.mesh.getMatrixAt(1, m);
        pos.setFromMatrixPosition(m);
        expect(pos.x).toBeCloseTo(0, 5);
        expect(pos.z).toBeCloseTo(-0.6, 5);

        ps.dispose();
    });

    it('translates particles up at ~3 units/sec', () => {
        const ps = new ParticleSystem({ maxParticles: 4, random: fixedRng([0.5]) });
        ps.spawnBurst(1);
        // 100ms at 3 units/sec → 0.3 units of travel.
        ps.update(100);
        const m = new THREE.Matrix4();
        ps.mesh.getMatrixAt(0, m);
        const pos = new THREE.Vector3();
        pos.setFromMatrixPosition(m);
        expect(pos.y).toBeCloseTo(-2 + 0.3, 4);
        ps.dispose();
    });

    it('keeps full scale before FADE_START_MS (1200ms)', () => {
        const ps = new ParticleSystem({ maxParticles: 4, random: fixedRng([0.5]) });
        ps.spawnBurst(1);
        ps.update(1100);
        const m = new THREE.Matrix4();
        ps.mesh.getMatrixAt(0, m);
        const scale = new THREE.Vector3();
        scale.setFromMatrixScale(m);
        expect(scale.x).toBeCloseTo(1, 4);
        ps.dispose();
    });

    it('shrinks scale during the fade window', () => {
        const ps = new ParticleSystem({ maxParticles: 4, random: fixedRng([0.5]) });
        ps.spawnBurst(1);
        // 1600ms: halfway through the [1200, 2000] fade — scale ~0.5
        ps.update(1600);
        const m = new THREE.Matrix4();
        ps.mesh.getMatrixAt(0, m);
        const scale = new THREE.Vector3();
        scale.setFromMatrixScale(m);
        expect(scale.x).toBeLessThan(1);
        expect(scale.x).toBeGreaterThan(0);
        ps.dispose();
    });

    it('deactivates particles past LIFETIME_MS (2000ms)', () => {
        const ps = new ParticleSystem({ maxParticles: 4, random: fixedRng([0.5]) });
        ps.spawnBurst(2);
        expect(ps.activeCount()).toBe(2);
        ps.update(2100);
        expect(ps.activeCount()).toBe(0);
        ps.dispose();
    });

    it('reuses freed slots when re-spawning', () => {
        const ps = new ParticleSystem({ maxParticles: 4, random: fixedRng([0.5]) });
        ps.spawnBurst(4);
        ps.update(2100); // kill them all
        expect(ps.activeCount()).toBe(0);

        const spawned = ps.spawnBurst(4);
        expect(spawned).toBe(4);
        expect(ps.activeCount()).toBe(4);
        ps.dispose();
    });

    it('reset() clears every particle immediately', () => {
        const ps = new ParticleSystem({ maxParticles: 4, random: fixedRng([0.5]) });
        ps.spawnBurst(3);
        ps.update(500);
        expect(ps.activeCount()).toBe(3);
        ps.reset();
        expect(ps.activeCount()).toBe(0);
        // Instance matrices should be scale=0.
        const m = new THREE.Matrix4();
        ps.mesh.getMatrixAt(0, m);
        const scale = new THREE.Vector3();
        scale.setFromMatrixScale(m);
        expect(scale.x).toBeCloseTo(0, 5);
        ps.dispose();
    });

    // ─── M9 chunk 2: seeded determinism ──────────────────────────

    it('seeded spawnBurst produces identical positions across calls', () => {
        // Two fresh systems, same seed → same positions.
        const a = new ParticleSystem({ maxParticles: 8 });
        const b = new ParticleSystem({ maxParticles: 8 });
        a.spawnBurst(4, 12345);
        b.spawnBurst(4, 12345);
        a.update(0);
        b.update(0);

        const m = new THREE.Matrix4();
        const aPos = new THREE.Vector3();
        const bPos = new THREE.Vector3();
        for (let i = 0; i < 4; i++) {
            a.mesh.getMatrixAt(i, m);
            aPos.setFromMatrixPosition(m);
            b.mesh.getMatrixAt(i, m);
            bPos.setFromMatrixPosition(m);
            expect(aPos.x).toBeCloseTo(bPos.x, 6);
            expect(aPos.z).toBeCloseTo(bPos.z, 6);
        }
        a.dispose();
        b.dispose();
    });

    it('seeded spawnBurst ignores the constructor random override', () => {
        // Constructor random returns 0.5 (center) — but the seed takes
        // over so positions should NOT be (0, 0).
        const ps = new ParticleSystem({
            maxParticles: 4,
            random: () => 0.5,
        });
        ps.spawnBurst(2, 999);
        ps.update(0);

        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        ps.mesh.getMatrixAt(0, m);
        pos.setFromMatrixPosition(m);
        // The seeded path produces non-center positions.
        expect(Math.abs(pos.x) + Math.abs(pos.z)).toBeGreaterThan(0);
        ps.dispose();
    });

    it('different seeds produce different positions', () => {
        const a = new ParticleSystem({ maxParticles: 4 });
        const b = new ParticleSystem({ maxParticles: 4 });
        a.spawnBurst(2, 1);
        b.spawnBurst(2, 2);
        a.update(0);
        b.update(0);

        const m = new THREE.Matrix4();
        const aPos = new THREE.Vector3();
        const bPos = new THREE.Vector3();
        a.mesh.getMatrixAt(0, m);
        aPos.setFromMatrixPosition(m);
        b.mesh.getMatrixAt(0, m);
        bPos.setFromMatrixPosition(m);
        // At least one coordinate should differ.
        const dx = Math.abs(aPos.x - bPos.x);
        const dz = Math.abs(aPos.z - bPos.z);
        expect(dx + dz).toBeGreaterThan(0.001);
        a.dispose();
        b.dispose();
    });

    it('spawnBurst without seed falls back to constructor random (back-compat)', () => {
        // Existing tests stayed passing because the seed path is opt-in.
        // Verify explicitly: constructor random=0.5 → center positions.
        const ps = new ParticleSystem({
            maxParticles: 4,
            random: () => 0.5,
        });
        ps.spawnBurst(1); // no seed
        ps.update(0);
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        ps.mesh.getMatrixAt(0, m);
        pos.setFromMatrixPosition(m);
        expect(pos.x).toBeCloseTo(0, 5);
        expect(pos.z).toBeCloseTo(0, 5);
        ps.dispose();
    });

    it('paints vertex colors with a bottom-to-top gradient', () => {
        // Verifies the comet-tail vertex-color setup. Top-face
        // vertices should have non-zero blue (cyan-300 has high B);
        // bottom-face vertices should be black.
        const ps = new ParticleSystem({ maxParticles: 1 });
        const colorAttr = ps.mesh.geometry.getAttribute('color');
        expect(colorAttr).toBeDefined();
        // BoxGeometry has 24 vertices (4 per face × 6 faces). At least
        // one should be near max-blue (top) and at least one near 0.
        let maxB = 0;
        let minB = 1;
        for (let i = 0; i < colorAttr.count; i++) {
            const b = colorAttr.getZ(i);
            if (b > maxB) maxB = b;
            if (b < minB) minB = b;
        }
        expect(maxB).toBeGreaterThan(0.8);
        expect(minB).toBeCloseTo(0, 4);
        ps.dispose();
    });
});
