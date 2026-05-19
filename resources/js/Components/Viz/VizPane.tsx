import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Card, CardContent } from '@/Components/ui/card';
import FpsCounter from '@/Components/Viz/FpsCounter';
import type { RunEvent } from '@/types/runs';

/*
 * VizPane (M8 chunk 1) — lazy-loaded right-pane visualization.
 *
 * Chunk 1 lands the foundation: Three.js scene + camera + lights +
 * OrbitControls + animation loop + an empty placeholder cube + an
 * overlay caption that reads "Submit a prompt to see the
 * visualization" when no events have arrived. Subsequent chunks
 * populate the scene with the transformer stack (chunk 2),
 * token-flow particles (chunk 3), and the rest.
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
    /** Optional layer count from the run's model snapshot — used by chunk 2. */
    totalLayers?: number | null;
}

export default function VizPane({ events, status }: VizPaneProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Scene with theme-aligned dark background. shadcn's `bg-card`
        // resolves through the CSS var; we read it once at mount and
        // skip live theme-change tracking for now.
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x020617); // slate-950-ish

        const camera = new THREE.PerspectiveCamera(
            45,
            canvas.clientWidth / canvas.clientHeight,
            0.1,
            100,
        );
        camera.position.set(3, 3, 6);
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

        // Lighting: an ambient term + a directional key light.
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const key = new THREE.DirectionalLight(0xffffff, 0.8);
        key.position.set(5, 8, 5);
        scene.add(key);

        // Placeholder geometry — a slow-spinning wireframe icosahedron
        // that signals "scene is alive" until chunk 2 wires the
        // transformer stack. Replaced wholesale next chunk.
        const placeholderGeom = new THREE.IcosahedronGeometry(1.2, 0);
        const placeholderMat = new THREE.MeshBasicMaterial({
            color: 0x4f46e5,
            wireframe: true,
            transparent: true,
            opacity: 0.6,
        });
        const placeholder = new THREE.Mesh(placeholderGeom, placeholderMat);
        scene.add(placeholder);

        // ResizeObserver keeps the renderer's drawing buffer in sync
        // with the canvas's CSS size. Necessary because Three.js
        // doesn't auto-resize.
        const resizeObs = new ResizeObserver(() => {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            if (w === 0 || h === 0) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        });
        resizeObs.observe(canvas);

        // Animation loop. mounted flag is the cleanup guard — we
        // can't reliably check `canvas.isConnected` because Three.js
        // keeps a reference to the original DOM node even after
        // React strict-mode remounts.
        let mounted = true;
        let raf = 0;
        const tick = () => {
            if (!mounted) return;
            placeholder.rotation.x += 0.003;
            placeholder.rotation.y += 0.005;
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
            placeholderGeom.dispose();
            placeholderMat.dispose();
            renderer.dispose();
        };
    }, []);

    const tokenCount = events.filter((e) => e.event === 'token.received').length;
    const showOverlay = status === 'idle' && tokenCount === 0;

    return (
        <Card data-testid="viz-pane">
            <CardContent className="relative p-0">
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-950">
                    <canvas
                        ref={canvasRef}
                        className="block h-full w-full"
                        data-testid="viz-canvas"
                        aria-label="Run visualization"
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
                </div>
                <div className="border-t border-border p-2 text-[10px] text-muted-foreground">
                    {tokenCount} {tokenCount === 1 ? 'token' : 'tokens'} · status: {status}
                </div>
            </CardContent>
        </Card>
    );
}
