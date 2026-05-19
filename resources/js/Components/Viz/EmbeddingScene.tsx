import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Card, CardContent } from '@/Components/ui/card';
import FpsCounter from '@/Components/Viz/FpsCounter';
import {
    EMBEDDING_CLUSTERS,
    buildEmbeddingPoints,
    type EmbeddingPoint,
} from '@/data/embeddingClusters';
import { buildEmbeddingLookup, extractTokenSequence } from '@/lib/embeddingHighlight';
import type { RunEvent } from '@/types/runs';

/*
 * EmbeddingScene (M8 chunk 7) — lazy-loaded 3D vocab scatter.
 *
 * Renders the ~280 synthetic vocab points (see
 * `data/embeddingClusters.ts`) as a `THREE.Points` cloud with
 * per-vertex colors driven by their cluster. As `token.received`
 * events stream in, the matching points fade up to full
 * brightness — a cumulative trail of "where the model has been
 * in vocab space" — and a glowing spotlight sphere snaps to
 * the most recent token's position.
 *
 * Tokens that don't match any synthetic vocab entry are silently
 * skipped (we don't pretend to know where they'd live). The
 * scatter is deterministic so positions are stable across
 * reloads, replays, and tests.
 *
 * Lazy-imported by `RightPane` in `Threads/Show` — only fetched
 * when the user toggles the Embeddings tab.
 */

interface EmbeddingSceneProps {
    events: RunEvent[];
    status: 'idle' | 'streaming' | 'complete' | 'errored';
}

const CAMERA_POS = new THREE.Vector3(0, 1, 7);
const POINT_BASE_OPACITY = 0.35;
const POINT_VISITED_OPACITY = 1;
const POINT_SIZE = 0.12;

export default function EmbeddingScene({ events, status }: EmbeddingSceneProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Refs into scene objects so the events watcher can mutate the
    // per-point alpha + spotlight position without rebuilding the
    // scene each render.
    const sceneObjects = useRef<{
        pointsAlpha: THREE.BufferAttribute | null;
        pointsGeometry: THREE.BufferGeometry | null;
        spotlight: THREE.Mesh | null;
        embeddingPoints: EmbeddingPoint[];
    }>({
        pointsAlpha: null,
        pointsGeometry: null,
        spotlight: null,
        embeddingPoints: [],
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x020617);

        const camera = new THREE.PerspectiveCamera(
            50,
            canvas.clientWidth / canvas.clientHeight,
            0.1,
            100,
        );
        camera.position.copy(CAMERA_POS);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.enableZoom = true;
        controls.enablePan = false;

        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambient);

        // Build the points cloud — one geometry attribute per vertex
        // for position, color, alpha. Custom ShaderMaterial reads the
        // alpha so the visited subset paints brighter than the base
        // cloud.
        const embeddingPoints = buildEmbeddingPoints();
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(embeddingPoints.length * 3);
        const colors = new Float32Array(embeddingPoints.length * 3);
        const alphas = new Float32Array(embeddingPoints.length).fill(POINT_BASE_OPACITY);

        for (let i = 0; i < embeddingPoints.length; i++) {
            const p = embeddingPoints[i];
            positions[i * 3 + 0] = p.position[0];
            positions[i * 3 + 1] = p.position[1];
            positions[i * 3 + 2] = p.position[2];
            const c = new THREE.Color(p.color);
            colors[i * 3 + 0] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const alphaAttr = new THREE.BufferAttribute(alphas, 1);
        alphaAttr.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('alpha', alphaAttr);

        // Custom shader: scale points by viewport, modulate alpha
        // per-vertex from the geometry attribute.
        const pointsMaterial = new THREE.ShaderMaterial({
            uniforms: {
                size: { value: POINT_SIZE * 80 },
            },
            vertexShader: `
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;
                uniform float size;
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (1.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    // Circular falloff so points look like dots not squares.
                    vec2 c = gl_PointCoord - 0.5;
                    float d = length(c);
                    if (d > 0.5) discard;
                    float edge = smoothstep(0.5, 0.35, d);
                    gl_FragColor = vec4(vColor, vAlpha * edge);
                }
            `,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
        });
        const points = new THREE.Points(geometry, pointsMaterial);
        scene.add(points);

        // Spotlight: bright glowing sphere that snaps to the latest
        // matched token. Hidden (scale 0) when nothing matched yet.
        const spotlightGeom = new THREE.SphereGeometry(0.15, 16, 16);
        const spotlightMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.85,
        });
        const spotlight = new THREE.Mesh(spotlightGeom, spotlightMat);
        spotlight.scale.set(0, 0, 0);
        scene.add(spotlight);

        sceneObjects.current = {
            pointsAlpha: alphaAttr,
            pointsGeometry: geometry,
            spotlight,
            embeddingPoints,
        };

        const resizeObs = new ResizeObserver(() => {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            if (w === 0 || h === 0) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        });
        resizeObs.observe(canvas);

        let mounted = true;
        let raf = 0;
        let lastTickMs = performance.now();
        const tick = (now: number) => {
            if (!mounted) return;
            const deltaMs = now - lastTickMs;
            lastTickMs = now;
            // Slow orbit so the cloud reads as 3D even with no events.
            // Auto-rotation only when nothing matched yet — once a
            // spotlight is active, hold still so the user can read.
            if (spotlight.scale.x < 0.01) {
                scene.rotation.y += deltaMs * 0.0001;
            }
            controls.update();
            renderer.render(scene, camera);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            mounted = false;
            cancelAnimationFrame(raf);
            resizeObs.disconnect();
            controls.dispose();
            sceneObjects.current = {
                pointsAlpha: null,
                pointsGeometry: null,
                spotlight: null,
                embeddingPoints: [],
            };
            geometry.dispose();
            pointsMaterial.dispose();
            spotlightGeom.dispose();
            spotlightMat.dispose();
            renderer.dispose();
        };
    }, []);

    // React to new events — recompute the trail + spotlight target.
    // Cheap because the lookup is built once at module load and the
    // alpha attribute write is a memcpy into the existing Float32Array.
    useEffect(() => {
        const so = sceneObjects.current;
        if (!so.pointsAlpha || !so.spotlight || so.embeddingPoints.length === 0) return;

        const lookup = lookupSingleton();
        const { visited, latest } = extractTokenSequence(events, lookup);

        const alphas = so.pointsAlpha.array as Float32Array;
        alphas.fill(POINT_BASE_OPACITY);
        for (const idx of visited) {
            alphas[idx] = POINT_VISITED_OPACITY;
        }
        so.pointsAlpha.needsUpdate = true;

        if (latest !== null) {
            const p = so.embeddingPoints[latest];
            so.spotlight.position.set(p.position[0], p.position[1], p.position[2]);
            so.spotlight.scale.set(1, 1, 1);
        } else {
            so.spotlight.scale.set(0, 0, 0);
        }
    }, [events]);

    const tokenCount = events.filter((e) => e.event === 'token.received').length;

    return (
        <Card data-testid="embedding-scene">
            <CardContent className="relative p-0">
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-950">
                    <canvas
                        ref={canvasRef}
                        className="block h-full w-full"
                        data-testid="embedding-canvas"
                        aria-label="Vocabulary embedding scatter"
                    />
                    <FpsCounter />
                    <div
                        className="pointer-events-none absolute top-2 left-2 right-2 space-y-1"
                        data-testid="embedding-legend"
                    >
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                            {EMBEDDING_CLUSTERS.map((c) => (
                                <span
                                    key={c.name}
                                    className="flex items-center gap-1 text-[10px] text-foreground/80"
                                >
                                    <span
                                        className="inline-block h-2 w-2 rounded-full"
                                        style={{ backgroundColor: c.color }}
                                        aria-hidden="true"
                                    />
                                    {c.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="border-t border-border p-2 text-[10px] text-muted-foreground">
                    {tokenCount} {tokenCount === 1 ? 'token' : 'tokens'} streamed · status: {status}{' '}
                    · synthetic vocab map
                </div>
            </CardContent>
        </Card>
    );
}

// Lookup is built once per page load and reused across re-renders +
// across mount/unmount of EmbeddingScene. The vocab data is static.
let _lookup: ReturnType<typeof buildEmbeddingLookup> | null = null;
function lookupSingleton() {
    if (_lookup === null) _lookup = buildEmbeddingLookup(buildEmbeddingPoints());
    return _lookup;
}
