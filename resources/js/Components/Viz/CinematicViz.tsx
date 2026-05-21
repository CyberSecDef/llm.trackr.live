import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useWebGL2Support } from '@/hooks/useWebGL2Support';
import { useSceneRunner } from '@/Components/Viz/useSceneRunner';
import { SCENE_LABELS } from '@/Components/Viz/Scene';
import VocabSidebar from '@/Components/Viz/VocabSidebar';
import ChatBubble from '@/Components/Viz/ChatBubble';
import LayerCounterHud from '@/Components/Viz/LayerCounterHud';
import PipelineProgressBar from '@/Components/Viz/PipelineProgressBar';
import { Card, CardContent } from '@/Components/ui/card';
import type { RunEvent } from '@/types/runs';

/*
 * CinematicViz (M13 chunk 1 stub) — the single mount point that
 * replaces the M8 right-pane tab toggle. Chunks 3-9 register
 * scenes with the runner; chunk 10 wires the persistent UI
 * sections to live data; chunks 11-13 add controls + degraded
 * modes. For now this just lays out the regions so the page
 * layout is final by chunk-1 close.
 *
 * Layout (within the 2/3-of-row viz aside):
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │ PipelineProgressBar (21 segments, current highlighted) │
 *   ├──────────┬────────────────────────────────────────────┤
 *   │          │                                            │
 *   │  Vocab   │   ┌──── LayerCounterHud (top-right) ────┐  │
 *   │  Sidebar │   │                                     │  │
 *   │          │   │   Scene canvas                       │  │
 *   │          │   │   (Scene N / total — chunk-1 stub) │  │
 *   │          │   │                                     │  │
 *   │          │   └─────────────────────────────────────┘  │
 *   │          │   ChatBubble (streaming output)             │
 *   └──────────┴────────────────────────────────────────────┘
 *
 * The aspect-square footprint from the old VizPane is replaced
 * with a flexible region that grows with the viz aside's width.
 */

interface CinematicVizProps {
    /** Live or replayed event stream. Wired in chunk 10. */
    events: RunEvent[];
    /** Model snapshot for layer count, vocab size, etc. Wired chunk 2+. */
    model?: {
        layers: number | null;
        attention_heads: number | null;
        context_length: number | null;
        architecture_type: string | null;
    } | null;
}

// Chunk 1 stub: props are received but not consumed yet — scenes
// (chunks 3-9) will plumb them in. Disable the unused-vars + empty-
// object-pattern lint warnings for the placeholder period.

export default function CinematicViz(_props: CinematicVizProps) {
    const reducedMotion = useReducedMotion();
    const webgl2Supported = useWebGL2Support();
    const { state, controls } = useSceneRunner();

    // M13 chunk 1 — gate semantics are placeholder. Chunk 13 owns
    // the tri-state (full / 2D-svg / debug-text) implementation.
    // For now: just surface the banner copy so the user knows
    // what they're looking at.
    const gateMessage = !webgl2Supported
        ? 'WebGL 2.0 is unavailable in this browser. The visualization will render in 2D-only mode once Chunk 13 lands.'
        : reducedMotion
          ? 'Reduced-motion is set. The visualization will play scene-by-scene without continuous animation once Chunk 13 lands.'
          : null;

    return (
        <Card data-testid="cinematic-viz">
            <CardContent className="space-y-2 p-2">
                <PipelineProgressBar
                    currentSceneId={state.sceneId}
                    onSelectScene={(id) => {
                        // The hook controls accept index; PipelineProgressBar
                        // emits the id. We resolve via the scene order.
                        // (Cheap: 21 entries, indexOf is fine.)
                        const idx = state.sceneIndex;
                        if (state.sceneId !== id) {
                            // Find target index by id
                            const targetIdx = findSceneIndex(id);
                            if (targetIdx !== -1) controls.setScene(targetIdx);
                        } else {
                            controls.setScene(idx);
                        }
                    }}
                />

                <div className="flex min-h-[400px] gap-2">
                    <VocabSidebar />

                    <div className="relative flex-1 overflow-hidden rounded-md border border-border bg-slate-950">
                        <div className="absolute top-2 right-2 z-10">
                            <LayerCounterHud />
                        </div>

                        {gateMessage && (
                            <div
                                className="absolute top-2 left-2 z-10 max-w-md rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200"
                                role="note"
                                data-testid="cinematic-viz-gate-notice"
                            >
                                {gateMessage}
                            </div>
                        )}

                        {/* Scene canvas — stub. Chunks 3-9 mount the active
                            scene's render(t, input) output here. */}
                        <div
                            className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 text-center"
                            data-testid="cinematic-viz-canvas"
                        >
                            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                Scene {state.sceneIndex} / {state.totalScenes - 1}
                            </p>
                            <p className="text-sm text-foreground/80">
                                {SCENE_LABELS[state.sceneId]}
                            </p>
                            <p className="max-w-md text-[11px] text-muted-foreground/70 italic">
                                Cinematic visualization — Chunk 1 stub. Real scenes land in Chunks 3
                                through 9.
                            </p>
                        </div>

                        <div className="absolute bottom-2 right-2 z-10 w-72">
                            <ChatBubble />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

import { SCENE_IDS, type SceneId } from '@/Components/Viz/Scene';
function findSceneIndex(id: SceneId): number {
    return SCENE_IDS.indexOf(id);
}
