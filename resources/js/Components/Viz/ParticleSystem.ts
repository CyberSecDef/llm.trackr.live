import * as THREE from 'three';

/*
 * ParticleSystem (M8 chunk 3) — token-flow trails.
 *
 * Each `token.received` event spawns a burst of 5–10 particles at
 * the bottom of the stack; particles rise straight up through the
 * transformer at a fixed velocity, then fade out near the top.
 *
 * Implementation: a single `InstancedMesh` of thin Y-aligned boxes
 * (256-particle pool, max). Each box has a vertex-color gradient
 * — top vertices full bright, bottom vertices black — so additive
 * blending paints a comet-tail. Per-particle "fade" is implemented
 * by shrinking the instance's scale toward zero during the last
 * 800ms of life; this avoids a custom shader (per-instance opacity
 * isn't a built-in InstancedMesh feature).
 *
 * Pool semantics: spawnBurst walks the pool, claims the first
 * inactive slots, and returns how many it claimed. If the pool is
 * exhausted, excess particles are silently dropped — the renderer
 * caps the visual density at ~256 active streaks.
 *
 * The class deliberately knows nothing about React or the event
 * stream. The events watcher in `VizPane` calls `spawnBurst`; the
 * animation loop calls `update(deltaMs)`.
 */

const TOTAL_HEIGHT = 4; // Matches TransformerStack.
const Y_BOTTOM = -TOTAL_HEIGHT / 2;
// Velocity is calibrated so a particle traverses the full stack in
// ~1.3s — fast enough to feel like data flow, slow enough that the
// burst from a single token reads as a coherent group.
const VELOCITY_Y = 3.0; // world units / sec
// Total lifetime past spawn (ms). At velocity 3.0, a particle covers
// 4 units in ~1333ms; we extend lifetime to 2000ms so the fade lands
// well above the top slab rather than mid-stack.
const LIFETIME_MS = 2000;
// Fade begins ~200ms after the particle reaches the top, then takes
// 800ms to shrink to zero scale.
const FADE_START_MS = 1200;
const SPAWN_X_RANGE = 0.6;
const SPAWN_Z_RANGE = 0.6;
const STREAK_LENGTH = 0.45;
const STREAK_WIDTH = 0.04;
// cyan-300 — distinct from the cascade (indigo) and selected (amber)
// states so particles read as a third layer of information.
const PARTICLE_COLOR = 0x67e8f9;
const DEFAULT_POOL_SIZE = 256;

interface Particle {
    active: boolean;
    positionX: number;
    positionY: number;
    positionZ: number;
    ageMs: number;
}

export interface ParticleSystemOptions {
    /** Pool size — caps simultaneous active particles. */
    maxParticles?: number;
    /** Injectable RNG for deterministic spawn-position tests. */
    random?: () => number;
}

export class ParticleSystem {
    readonly group: THREE.Group;
    readonly mesh: THREE.InstancedMesh;
    private readonly particles: Particle[];
    private readonly maxParticles: number;
    private readonly random: () => number;
    // Reusable scratch vectors / matrices so the per-frame update
    // doesn't allocate.
    private readonly _matrix = new THREE.Matrix4();
    private readonly _position = new THREE.Vector3();
    private readonly _scale = new THREE.Vector3();
    private readonly _quat = new THREE.Quaternion();

    constructor(options: ParticleSystemOptions = {}) {
        this.maxParticles = options.maxParticles ?? DEFAULT_POOL_SIZE;
        this.random = options.random ?? Math.random;

        this.group = new THREE.Group();

        // BoxGeometry stretched along Y. Vertex colors interpolate
        // from black at the bottom face to PARTICLE_COLOR at the top
        // — combined with AdditiveBlending this paints the streak's
        // tail without any custom shader work.
        const geometry = new THREE.BoxGeometry(STREAK_WIDTH, STREAK_LENGTH, STREAK_WIDTH);
        const top = new THREE.Color(PARTICLE_COLOR);
        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);
        for (let i = 0; i < positions.count; i++) {
            const y = positions.getY(i);
            // Map y from [-L/2, L/2] to [0, 1] — bottom 0, top 1.
            const t = (y + STREAK_LENGTH / 2) / STREAK_LENGTH;
            colors[i * 3 + 0] = top.r * t;
            colors[i * 3 + 1] = top.g * t;
            colors[i * 3 + 2] = top.b * t;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            // depthWrite false so multiple overlapping streaks blend
            // additively instead of one occluding another.
            depthWrite: false,
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.maxParticles);
        // Start every instance at scale 0 — invisible until spawned.
        for (let i = 0; i < this.maxParticles; i++) {
            this._matrix.makeScale(0, 0, 0);
            this.mesh.setMatrixAt(i, this._matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;

        this.group.add(this.mesh);

        this.particles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push({
                active: false,
                positionX: 0,
                positionY: Y_BOTTOM,
                positionZ: 0,
                ageMs: 0,
            });
        }
    }

    /**
     * Spawn up to `count` particles at the bottom of the stack with
     * randomized X/Z jitter. Returns the number actually spawned —
     * less than `count` if the pool is saturated.
     *
     * When `seed` is provided (M9 chunk 2 strict-determinism path),
     * jitter is derived from a per-call xorshift32 keyed by `seed`,
     * ignoring the constructor's `random`. Replay calls pass a
     * token-index-derived seed (`burstForToken(tokenIndex).seed`) so
     * the same token always lands particles in the same positions.
     */
    spawnBurst(count: number, seed?: number): number {
        const rng = seed !== undefined ? makeSeededRng(seed) : this.random;
        let spawned = 0;
        for (let i = 0; i < this.particles.length && spawned < count; i++) {
            const p = this.particles[i];
            if (p.active) continue;
            p.active = true;
            p.positionY = Y_BOTTOM;
            p.positionX = (rng() - 0.5) * 2 * SPAWN_X_RANGE;
            p.positionZ = (rng() - 0.5) * 2 * SPAWN_Z_RANGE;
            p.ageMs = 0;
            spawned++;
        }
        return spawned;
    }

    /** Number of currently-active particles. Test helper. */
    activeCount(): number {
        let n = 0;
        for (const p of this.particles) if (p.active) n++;
        return n;
    }

    /**
     * Advance every particle by deltaMs and rebuild the instance
     * matrices. Inactive particles get scale=0 so they don't render.
     */
    update(deltaMs: number): void {
        const dt = deltaMs / 1000;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (!p.active) {
                this._matrix.makeScale(0, 0, 0);
                this.mesh.setMatrixAt(i, this._matrix);
                continue;
            }
            p.ageMs += deltaMs;
            p.positionY += VELOCITY_Y * dt;

            // Fade is implemented as a scale ramp from 1 → 0 over
            // [FADE_START_MS, LIFETIME_MS]. Avoids a custom shader.
            let scale = 1;
            if (p.ageMs >= FADE_START_MS) {
                scale = Math.max(0, 1 - (p.ageMs - FADE_START_MS) / (LIFETIME_MS - FADE_START_MS));
            }

            if (p.ageMs >= LIFETIME_MS || scale <= 0) {
                p.active = false;
                this._matrix.makeScale(0, 0, 0);
            } else {
                this._position.set(p.positionX, p.positionY, p.positionZ);
                this._scale.set(scale, scale, scale);
                this._matrix.compose(this._position, this._quat, this._scale);
            }
            this.mesh.setMatrixAt(i, this._matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /** Clear all particles. Used between runs / on backfill replay. */
    reset(): void {
        for (const p of this.particles) {
            p.active = false;
            p.ageMs = 0;
            p.positionY = Y_BOTTOM;
        }
        for (let i = 0; i < this.maxParticles; i++) {
            this._matrix.makeScale(0, 0, 0);
            this.mesh.setMatrixAt(i, this._matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}

/**
 * xorshift32-based PRNG factory. Same algorithm used by the chunk-3
 * embeddingClusters jitter + the chunk-5a attentionPattern noise —
 * cheap, deterministic, fine for non-cryptographic visual seeding.
 */
function makeSeededRng(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        s >>>= 0;
        return (s % 1_000_000) / 1_000_000;
    };
}
