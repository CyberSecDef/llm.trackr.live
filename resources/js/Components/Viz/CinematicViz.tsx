import { useMemo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useWebGL2Support } from '@/hooks/useWebGL2Support';
import { useSceneRunner } from '@/Components/Viz/useSceneRunner';
import {
    SCENE_IDS,
    SCENE_LABELS,
    type PipelineState,
    type Scene,
    type SceneId,
} from '@/Components/Viz/Scene';
import { ALL_SCENES } from '@/Components/Viz/scenes';
import VocabSidebar from '@/Components/Viz/VocabSidebar';
import ChatBubble from '@/Components/Viz/ChatBubble';
import LayerCounterHud from '@/Components/Viz/LayerCounterHud';
import PipelineProgressBar from '@/Components/Viz/PipelineProgressBar';
import { Card, CardContent } from '@/Components/ui/card';
import type { RunEvent } from '@/types/runs';

/*
 * CinematicViz (M13) — the single mount point that replaces the
 * M8 right-pane tab toggle. Chunk 1 stubbed; chunk 3 wires in the
 * first 5 scenes (text → tokens); chunks 4-9 add the rest.
 *
 * Chunk 3a additions:
 *   - `prompt: string | null` prop. When `null`, the canvas shows
 *     the idle screen ("Submit a prompt to start"). When a string
 *     arrives, the runner seeds PipelineState with {promptText}
 *     and starts walking the registered scenes.
 *   - `scenes` array passed from the parent (chunks 3-9 add entries).
 *     For chunk 3a the registry is empty; chunk 3b/3c fill it.
 *   - Active scene's `render(t, pipelineState)` mounts in the canvas
 *     region. When the registry is empty or the index has no scene,
 *     the placeholder text from chunk 1 still shows.
 *
 * Layout (within the 2/3-of-row viz aside) unchanged from chunk 1.
 */

interface CinematicVizProps {
    /** Live or replayed event stream. Wired in chunk 10. */
    events: RunEvent[];
    /** Model snapshot for layer count, vocab size, etc. Wired chunk 4+. */
    model?: {
        layers: number | null;
        attention_heads: number | null;
        context_length: number | null;
        architecture_type: string | null;
    } | null;
    /** The active run's prompt text. `null` means no run yet — idle screen. */
    prompt?: string | null;
    /** Registered scene definitions, Scene 0..Scene 20. Defaults to []. */
    scenes?: ReadonlyArray<Scene<PipelineState, PipelineState>>;
}

export default function CinematicViz({ prompt, scenes = ALL_SCENES }: CinematicVizProps) {
    const reducedMotion = useReducedMotion();
    const webgl2Supported = useWebGL2Support();

    // The initial pipeline state seeds Scene 0 with the prompt text.
    // `useMemo` so the reference is stable across renders when the
    // prompt hasn't changed — otherwise useSceneRunner resets to
    // Scene 0 on every parent render.
    const initialState = useMemo<PipelineState>(
        () => (prompt ? { promptText: prompt } : {}),
        [prompt],
    );

    const { state, controls } = useSceneRunner({
        scenes,
        initialState,
        autoplay: prompt !== null && prompt !== undefined,
    });

    const gateMessage = !webgl2Supported
        ? 'WebGL 2.0 is unavailable in this browser. The visualization will render in 2D-only mode once Chunk 13 lands.'
        : reducedMotion
          ? 'Reduced-motion is set. The visualization will play scene-by-scene without continuous animation once Chunk 13 lands.'
          : null;

    const idle = !prompt;
    const activeScene = state.currentScene;

    return (
        <Card data-testid="cinematic-viz">
            <CardContent className="space-y-2 p-2">
                <PipelineProgressBar
                    currentSceneId={state.sceneId}
                    onSelectScene={(id) => {
                        const targetIdx = SCENE_IDS.indexOf(id as SceneId);
                        if (targetIdx !== -1) controls.setScene(targetIdx);
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

                        {idle ? (
                            <div
                                className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 text-center"
                                data-testid="cinematic-viz-idle"
                            >
                                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    Pipeline idle
                                </p>
                                <p className="text-sm text-foreground/80">
                                    Submit a prompt to start the visualization.
                                </p>
                                <p className="max-w-md text-[11px] text-muted-foreground/70 italic">
                                    The 20-scene narrative runs from prompt entry through
                                    autoregressive token emission.
                                </p>
                            </div>
                        ) : activeScene ? (
                            <div
                                className="flex h-full min-h-[400px] flex-col"
                                data-testid="cinematic-viz-canvas"
                                data-scene-id={state.sceneId}
                                data-scene-t={state.t.toFixed(3)}
                            >
                                {activeScene.render(state.t, state.pipelineState)}
                            </div>
                        ) : (
                            // Prompt present but the scene at this index isn't
                            // registered yet. Show the chunk-1 placeholder text
                            // so the user knows where we are in the pipeline.
                            <div
                                className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 text-center"
                                data-testid="cinematic-viz-canvas"
                                data-scene-id={state.sceneId}
                            >
                                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    Scene {state.sceneIndex} / {state.totalScenes - 1}
                                </p>
                                <p className="text-sm text-foreground/80">
                                    {SCENE_LABELS[state.sceneId]}
                                </p>
                                <p className="max-w-md text-[11px] text-muted-foreground/70 italic">
                                    Scene not yet implemented. Lands in a later M13 sub-chunk.
                                </p>
                            </div>
                        )}

                        <div className="absolute bottom-2 right-2 z-10 w-72">
                            <ChatBubble />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
