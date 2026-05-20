import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/Components/ui/card';
import FpsCounter from '@/Components/Viz/FpsCounter';
import AttentionHeatmap from '@/Components/Viz/AttentionHeatmap';
import { CascadeController } from '@/Components/Viz/CascadeController';
import { ParticleSystem } from '@/Components/Viz/ParticleSystem';
import { TransformerStack } from '@/Components/Viz/TransformerStack';
import { subComponentsFor } from '@/Components/Viz/subComponents';
import { generateAttentionPattern } from '@/lib/attentionPattern';
import { burstForToken } from '@/lib/particleBurst';
import type { RunEvent } from '@/types/runs';

/*
 * VizPane (M8) — lazy-loaded right-pane visualization.
 *
 * Chunks land incrementally:
 *  1. Scene foundation: camera / lights / OrbitControls / RAF loop.
 *  2. Transformer stack: N normalized slabs from the model snapshot,
 *     cascade animation driven by layer.advanced events, click-to-
 *     zoom with an HTML sub-component overlay (RMSNorm → Attention
 *     → Residual → FFN/MoE → Residual).
 *  3+. Token-flow particles, attention heatmap, MoE routing, etc.
 *
 * The component is intentionally code-split (loaded by Show.tsx via
 * React.lazy) so the ~600KB Three.js bundle stays out of the main
 * app chunk. Users without an in-flight run never download it.
 *
 * Reduced-motion handling lives one level up in `Show.tsx` (where
 * the toggle + Suspense fallback are); when prefers-reduced-motion
 * is set, the component never imports.
 */

interface VizPaneProps {
    events: RunEvent[];
    status: 'idle' | 'streaming' | 'complete' | 'errored';
    /** Optional layer count from the run's model snapshot. */
    totalLayers?: number | null;
    /** 'dense' | 'moe' | null — drives the sub-component overlay copy. */
    architectureType?: string | null;
}

// Default camera frame the scene snaps back to when the user
// "unzooms" out of a selected layer.
const DEFAULT_CAM_POS = new THREE.Vector3(3, 3, 6);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);
const FOCUS_DISTANCE = 3.2; // distance the camera holds from the focused slab

export default function VizPane({ events, status, totalLayers, architectureType }: VizPaneProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Scene-effect-owned objects exposed via refs so other effects /
    // event handlers can poke at them without re-running the mount.
    const cascadeRef = useRef<CascadeController | null>(null);
    const particlesRef = useRef<ParticleSystem | null>(null);
    const stackRef = useRef<TransformerStack | null>(null);
    const cameraTargetPosRef = useRef<THREE.Vector3>(DEFAULT_CAM_POS.clone());
    const orbitTargetRef = useRef<THREE.Vector3>(DEFAULT_TARGET.clone());
    const consumedEventCount = useRef(0);

    const [selectedLayer, setSelectedLayer] = useState<number | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x020617); // slate-950-ish

        const camera = new THREE.PerspectiveCamera(
            45,
            canvas.clientWidth / canvas.clientHeight,
            0.1,
            100,
        );
        camera.position.copy(DEFAULT_CAM_POS);
        camera.lookAt(DEFAULT_TARGET);

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

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const key = new THREE.DirectionalLight(0xffffff, 0.8);
        key.position.set(5, 8, 5);
        scene.add(key);

        const stack = new TransformerStack({ layerCount: totalLayers });
        scene.add(stack.group);
        stackRef.current = stack;

        const cascade = new CascadeController(stack);
        cascadeRef.current = cascade;

        // M8 chunk 3: token-flow streaks. One burst per token.received
        // event, rising bottom → top, fading near the top of the stack.
        const particles = new ParticleSystem();
        scene.add(particles.group);
        particlesRef.current = particles;

        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();

        // Click-to-zoom (M8 chunk 2). Raycast against slabs; if a
        // slab is hit, walk back its layerIndex through React state
        // so the overlay re-renders and the focus effect kicks in.
        const onClick = (ev: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(ndc, camera);
            const hits = raycaster.intersectObjects(stack.slabs, false);
            if (hits.length === 0) return;
            const hit = hits[0].object as THREE.Mesh;
            const layerIndex = hit.userData.layerIndex as number | undefined;
            if (typeof layerIndex === 'number') {
                setSelectedLayer(layerIndex);
            }
        };
        canvas.addEventListener('click', onClick);

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

            // Lerp camera + orbit target toward their refs each frame.
            // 0.08 ≈ ~5-frame settle at 60fps — feels snappy without
            // being instant.
            camera.position.lerp(cameraTargetPosRef.current, 0.08);
            controls.target.lerp(orbitTargetRef.current, 0.08);

            // Slow Y-axis rotation only when no layer is selected
            // — once the user has focused on something we hold still.
            if (stackRef.current && cameraTargetPosRef.current.equals(DEFAULT_CAM_POS)) {
                stack.group.rotation.y += deltaMs * 0.00012;
            }
            cascade.update(deltaMs);
            particles.update(deltaMs);
            controls.update();
            renderer.render(scene, camera);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            mounted = false;
            cancelAnimationFrame(raf);
            canvas.removeEventListener('click', onClick);
            resizeObs.disconnect();
            controls.dispose();
            cascadeRef.current = null;
            particlesRef.current = null;
            stackRef.current = null;
            particles.dispose();
            stack.dispose();
            renderer.dispose();
        };
        // totalLayers triggers a full scene rebuild — necessary
        // because the stack's geometry is sized to N at construction.
    }, [totalLayers]);

    // Layer-selection effect: paints the chosen layer 'selected' and
    // moves the camera target to focus on it. Clearing selection
    // returns to the default frame.
    useEffect(() => {
        const stack = stackRef.current;
        if (!stack) return;

        if (selectedLayer === null) {
            cameraTargetPosRef.current = DEFAULT_CAM_POS.clone();
            orbitTargetRef.current = DEFAULT_TARGET.clone();
            // Don't clobber cascade highlights — only repaint slabs
            // that were specifically in the 'selected' state.
            for (let i = 0; i < stack.getLayerCount(); i++) {
                if (stack.getLayerState(i) === 'selected') {
                    stack.setLayerState(i, 'base');
                }
            }
            return;
        }

        const slab = stack.slabs[selectedLayer];
        if (!slab) return;

        // Clear prior 'selected' marks, set this one.
        for (let i = 0; i < stack.getLayerCount(); i++) {
            if (i !== selectedLayer && stack.getLayerState(i) === 'selected') {
                stack.setLayerState(i, 'base');
            }
        }
        stack.setLayerState(selectedLayer, 'selected');

        // Camera focus: offset to the side + up a bit so the slab
        // shows in profile rather than straight-on.
        const target = slab.position.clone();
        const camPos = new THREE.Vector3(
            target.x + FOCUS_DISTANCE,
            target.y + 0.6,
            target.z + FOCUS_DISTANCE,
        );
        cameraTargetPosRef.current = camPos;
        orbitTargetRef.current = target;
    }, [selectedLayer]);

    // Events watcher: forwards new layer.advanced events into the
    // cascade controller, and spawns a particle burst per
    // token.received event. Tracks the last consumed index so a
    // re-render with the same events doesn't re-fire.
    useEffect(() => {
        const cascade = cascadeRef.current;
        const particles = particlesRef.current;
        if (!cascade || !particles) return;
        if (events.length < consumedEventCount.current) {
            cascade.reset();
            particles.reset();
            consumedEventCount.current = 0;
            setSelectedLayer(null);
        }
        for (let i = consumedEventCount.current; i < events.length; i++) {
            const e = events[i];
            if (e.event === 'layer.advanced') {
                cascade.pushWave();
            } else if (e.event === 'token.received') {
                // M9 chunk 2 strict determinism: burst size + jitter
                // seed are pure functions of the token's index in the
                // run. Two replays of the same run produce identical
                // particle positions for every token.
                const { count, seed } = burstForToken(e.payload.index);
                particles.spawnBurst(count, seed);
            }
        }
        consumedEventCount.current = events.length;
    }, [events]);

    // Reset the selection when totalLayers changes (different run).
    // setState-in-effect is correct here: external prop change.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedLayer(null);
    }, [totalLayers]);

    const tokenCount = events.filter((e) => e.event === 'token.received').length;
    const showOverlay = status === 'idle' && tokenCount === 0;

    return (
        <Card data-testid="viz-pane">
            <CardContent className="relative p-0">
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-950">
                    <canvas
                        ref={canvasRef}
                        className="block h-full w-full cursor-pointer"
                        data-testid="viz-canvas"
                        aria-label="Run visualization. Click a layer to zoom in."
                    />
                    <FpsCounter />
                    {showOverlay && (
                        <div
                            className="pointer-events-none absolute inset-0 flex items-center justify-center"
                            data-testid="viz-empty-overlay"
                        >
                            <p className="text-xs text-muted-foreground">
                                Submit a prompt to see the visualization.
                            </p>
                        </div>
                    )}
                    {selectedLayer !== null && (
                        <LayerDetailOverlay
                            layerIndex={selectedLayer}
                            totalLayers={totalLayers ?? null}
                            architectureType={architectureType ?? null}
                            tokenCount={tokenCount}
                            onClose={() => setSelectedLayer(null)}
                        />
                    )}
                </div>
                <div className="border-t border-border p-2 text-[10px] text-muted-foreground">
                    {tokenCount} {tokenCount === 1 ? 'token' : 'tokens'} · status: {status}
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * LayerDetailOverlay — HTML panel anchored to the bottom-left of
 * the canvas while a layer is selected. Lists the five sub-
 * components in transformer-block order and offers a "back" button.
 *
 * The overlay is HTML (not in-scene Three.js text) because text
 * rendering in WebGL is heavyweight and accessibility tooling
 * can't reach in-canvas content.
 */
function LayerDetailOverlay({
    layerIndex,
    totalLayers,
    architectureType,
    tokenCount,
    onClose,
}: {
    layerIndex: number;
    totalLayers: number | null;
    architectureType: string | null;
    /** Tokens generated so far — drives the heatmap matrix size. */
    tokenCount: number;
    onClose: () => void;
}) {
    const subs = subComponentsFor(architectureType);

    // M8 chunk 5a: synthetic attention pattern, deterministic per
    // (tokenCount, layerIndex, totalLayers). Capped at 24×24 so the
    // heatmap stays legible in the overlay's ~256px width — earlier
    // tokens past the window simply aren't shown.
    const HEATMAP_TOKENS = Math.min(tokenCount, 24);
    const matrix =
        HEATMAP_TOKENS > 0
            ? generateAttentionPattern(HEATMAP_TOKENS, layerIndex, totalLayers ?? 12)
            : [];

    return (
        <div
            className="absolute bottom-2 left-2 right-2 max-w-xs space-y-2 rounded-md border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm"
            data-testid="layer-detail-overlay"
            role="region"
            aria-label={`Layer ${layerIndex} details`}
        >
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                    Layer {layerIndex + 1}
                    {totalLayers !== null && (
                        <span className="text-muted-foreground"> / {totalLayers}</span>
                    )}
                    {architectureType === 'moe' && (
                        <span
                            className="ml-1 rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300"
                            data-testid="moe-badge"
                        >
                            MoE
                        </span>
                    )}
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Close layer detail"
                    data-testid="close-layer-detail"
                >
                    <X className="h-3 w-3" aria-hidden="true" />
                </button>
            </div>
            <ol className="space-y-1.5 text-[11px]">
                {subs.map((sub, i) => (
                    <li key={i} className="flex gap-2">
                        <span className="font-mono text-muted-foreground">{i + 1}.</span>
                        <span className="flex-1">
                            <span className="font-medium">{sub.name}</span>
                            <span className="ml-1 text-muted-foreground">{sub.description}</span>
                        </span>
                    </li>
                ))}
            </ol>
            {matrix.length > 0 && (
                <AttentionHeatmap
                    matrix={matrix}
                    size={180}
                    caption={`Attention · layer ${layerIndex + 1}`}
                />
            )}
        </div>
    );
}
