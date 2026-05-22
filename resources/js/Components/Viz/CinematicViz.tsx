import { useEffect, useMemo } from 'react';
import { loadTokenizer } from '@/lib/tokenizer';
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
        /** Vocab size for the LM head label in Scene 14. Not in
         *  the DB schema yet — pages currently pass null and
         *  Scene 14 defaults to 128,000 (chunk 8a). A future
         *  migration may add `runs.vocab_size`. */
        vocab_size?: number | null;
    } | null;
    /** The active run's prompt text. `null` means no run yet — idle screen. */
    prompt?: string | null;
    /** Registered scene definitions, Scene 0..Scene 20. Defaults to []. */
    scenes?: ReadonlyArray<Scene<PipelineState, PipelineState>>;
}

export default function CinematicViz({
    events = [],
    model,
    prompt,
    scenes = ALL_SCENES,
}: CinematicVizProps) {
    const reducedMotion = useReducedMotion();
    const webgl2Supported = useWebGL2Support();

    // M13 chunk 3c: warm up the BPE tokenizer as soon as a prompt
    // arrives. Scenes 0-2 don't need it; Scene 3 does. The pipeline
    // takes ~6.7s to reach Scene 3 at 1× speed — plenty of time for
    // a sub-second lazy-load. If the load is still pending when
    // Scene 3 starts, it falls back to a "tokenizing…" placeholder.
    useEffect(() => {
        if (prompt) {
            void loadTokenizer().catch(() => {
                /* fallback tokenizer kicks in inside loadTokenizer */
            });
        }
    }, [prompt]);

    // The initial pipeline state seeds Scene 0 with the prompt text
    // and the architecture type (chunk 6: Scene 10 branches on this
    // to label SwiGLU vs GELU). `useMemo` so the reference is stable
    // across renders when the prompt hasn't changed — otherwise
    // useSceneRunner resets to Scene 0 on every parent render.
    const initialState = useMemo<PipelineState>(
        () =>
            prompt
                ? {
                      promptText: prompt,
                      architectureType: model?.architecture_type ?? null,
                      totalLayers: model?.layers ?? null,
                      vocabSize: model?.vocab_size ?? null,
                      // Chunk 8b sampling defaults. Chunk 10 wires
                      // these from run.parameters.
                      samplingMode: 'greedy',
                      samplingK: 40,
                      samplingP: 0.95,
                      samplingTemperature: 1.0,
                      generatedTokens: [],
                  }
                : {},
        [prompt, model?.architecture_type, model?.layers, model?.vocab_size],
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

    // M13 chunk 3c: derive the VocabSidebar reveal count from the
    // current scene + t. Scene 3 (bpe-tokenize) reveals tokens
    // progressively; Scene 4+ shows them all.
    const vocabTokens = state.pipelineState.tokens ?? [];
    const vocabRevealedCount = (() => {
        if (state.sceneIndex < 3) return 0;
        if (state.sceneIndex > 3) return vocabTokens.length;
        // Scene 3 in flight: linear sweep.
        return Math.min(vocabTokens.length, Math.floor(state.t * vocabTokens.length) + 1);
    })();

    // M13 chunk 10: Scene 20 reverse-lookup highlight. Scene 20's
    // detokenize beat walks through generatedTokens; map the active
    // index back to a vocab-sidebar row via string match. When the
    // generated string matches a sidebar token, that row rings.
    // Outside Scene 20, no override (the chunk-3c "most-recent" tag
    // applies).
    const vocabHighlight = (() => {
        if (state.sceneId !== 'detokenize') return null;
        const generated = state.pipelineState.generatedTokens ?? [];
        if (generated.length === 0) return null;
        const REVEAL_PHASE_END = 0.75; // mirrors DetokenizeScene
        if (state.t >= REVEAL_PHASE_END) return null;
        const activeIdx = Math.min(
            generated.length - 1,
            Math.floor((state.t / REVEAL_PHASE_END) * generated.length),
        );
        const targetString = generated[activeIdx].string;
        // First sidebar row whose string matches; null if none.
        const row = vocabTokens.findIndex((t) => t.string === targetString);
        return row >= 0 ? row : null;
    })();

    // M13 chunk 10b: derive chat-bubble tokens from the WebSocket
    // event stream when present, falling back to the scene-driven
    // generatedTokens. Spec literal: "driven directly by the real
    // token.received WebSocket event so the user sees the response
    // coming in even if the visualization hasn't reached Scene 17
    // yet." When events stream live, the bubble can be ahead of the
    // viz; when no events arrive (isolated chunk testing, replay
    // without a stream), the chunks 8b/9a-populated generatedTokens
    // fill in.
    const tokenEvents = events.filter(
        (e): e is Extract<RunEvent, { event: 'token.received' }> => e.event === 'token.received',
    );
    const chatTokens = (() => {
        if (tokenEvents.length > 0) {
            return tokenEvents.map((e) => e.payload.token);
        }
        return (state.pipelineState.generatedTokens ?? []).map((t) => t.string);
    })();
    const chatIsFinal =
        tokenEvents.length > 0
            ? tokenEvents[tokenEvents.length - 1]?.payload.is_final === true
            : state.sceneId === 'detokenize' && state.t >= 0.9;

    // M13 chunk 10: LayerCounterHud visibility + values. Visible
    // during scenes 5-12 (the per-layer + tower scenes); hidden on
    // tokenization (0-4) + output (13-20). currentLayer defaults to
    // 1 during scenes 5-11 (single-layer view); Scene 12's tower
    // ramps it 1→N via the same towerCamera math the in-canvas
    // counter uses.
    const totalLayersValue = state.pipelineState.totalLayers ?? 32;
    const layerCounterVisible = state.sceneIndex >= 5 && state.sceneIndex <= 12;
    const currentLayerValue = (() => {
        if (!layerCounterVisible) return null;
        if (state.sceneId === 'layer-stack') {
            // Mirror towerCamera.counterValue without re-importing
            // the lib (it's already imported by the Scene 12 module).
            // The HUD value matches the in-canvas counter exactly.
            const N = totalLayersValue;
            const t = state.t;
            const PHASE_REVEAL_END = 0.1;
            const PHASE_FOLLOW_END = 0.2;
            const PHASE_BLUR_END = 0.5;
            const PHASE_SLOW_END = 0.8;
            let packetFloor: number;
            if (t < PHASE_REVEAL_END) packetFloor = 1;
            else if (t < PHASE_FOLLOW_END) {
                const p = (t - PHASE_REVEAL_END) / (PHASE_FOLLOW_END - PHASE_REVEAL_END);
                packetFloor = 1 + p;
            } else if (t < PHASE_BLUR_END) {
                const p = (t - PHASE_FOLLOW_END) / (PHASE_BLUR_END - PHASE_FOLLOW_END);
                const eased = 1 - (1 - p) * (1 - p);
                const top = Math.max(2, N - 2);
                packetFloor = 2 + eased * (top - 2);
            } else if (t < PHASE_SLOW_END) {
                const p = (t - PHASE_BLUR_END) / (PHASE_SLOW_END - PHASE_BLUR_END);
                const top = Math.max(2, N - 2);
                packetFloor = top + p * (N - top);
            } else packetFloor = N;
            return Math.max(1, Math.round(packetFloor));
        }
        // Scenes 5-11: a single representative layer.
        return 1;
    })();

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
                    <VocabSidebar
                        tokens={vocabTokens}
                        revealedCount={vocabRevealedCount}
                        highlightTokenIndex={vocabHighlight}
                    />

                    <div className="relative flex-1 overflow-hidden rounded-md border border-border bg-slate-950">
                        <div className="absolute top-2 right-2 z-10">
                            <LayerCounterHud
                                currentLayer={currentLayerValue}
                                totalLayers={layerCounterVisible ? totalLayersValue : null}
                                visible={layerCounterVisible}
                            />
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
                            <ChatBubble tokens={chatTokens} isFinal={chatIsFinal} />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
