/*
 * Scene contract for the M13 cinematic visualization.
 *
 * Per `docs/visualization.md` production note: "Build each scene as
 * a self-contained component that accepts its input state as props
 * and emits its output state on completion." This file owns the
 * shared types; individual scene implementations land in chunks
 * 3 through 9.
 *
 * A `Scene<I, O>` is a pure declarative description — what it
 * needs, what it produces, how long it takes to play at 1× speed,
 * and a render function that takes a normalized time `t ∈ [0, 1]`
 * and returns React nodes. The SceneRunner (see useSceneRunner.ts)
 * advances `t`, hands the previous scene's `O` to the next scene
 * as `I`, and fires `onComplete` when `t === 1`.
 */

import type { ReactNode } from 'react';

/**
 * Stable ordinal identifier for each scene in the pipeline. Used
 * by the pipeline progress bar (chunks 10/11) + the scrubber
 * (chunk 11) to jump to a specific scene by index.
 */
export const SCENE_IDS = [
    'prompt-entry', // Scene 0
    'chars-to-bytes', // Scene 1
    'chat-template', // Scene 2
    'bpe-tokenize', // Scene 3
    'token-ids', // Scene 4
    'embedding-lookup', // Scene 5
    'positional-encoding', // Scene 6
    'layer-norm', // Scene 7
    'attention', // Scene 8 (the centerpiece)
    'residual-1', // Scene 9
    'ffn', // Scene 10
    'residual-2', // Scene 11
    'layer-stack', // Scene 12 (tower view)
    'final-norm', // Scene 13
    'lm-head', // Scene 14
    'softmax', // Scene 15
    'sampling', // Scene 16
    'token-emerge', // Scene 17
    'autoregressive-loop', // Scene 18
    'kv-cache', // Scene 19 (overlay during 18)
    'detokenize', // Scene 20 (continuous during 18)
] as const;

export type SceneId = (typeof SCENE_IDS)[number];

/**
 * Human-readable label for the pipeline-progress bar. One per
 * SCENE_IDS entry, same order.
 */
export const SCENE_LABELS: Record<SceneId, string> = {
    'prompt-entry': 'Prompt',
    'chars-to-bytes': 'Bytes',
    'chat-template': 'Chat tpl',
    'bpe-tokenize': 'BPE',
    'token-ids': 'IDs',
    'embedding-lookup': 'Embed',
    'positional-encoding': 'RoPE',
    'layer-norm': 'Norm',
    attention: 'Attention',
    'residual-1': 'Residual',
    ffn: 'FFN',
    'residual-2': 'Residual',
    'layer-stack': 'Layers',
    'final-norm': 'Norm',
    'lm-head': 'LM head',
    softmax: 'Softmax',
    sampling: 'Sample',
    'token-emerge': 'Emit',
    'autoregressive-loop': 'Loop',
    'kv-cache': 'Cache',
    detokenize: 'Detok',
};

/**
 * Single scene description. The runner walks an array of these.
 *
 *   id          — stable identifier; also doubles as React key.
 *   durationMs  — wall-clock time the scene plays at 1× speed.
 *                 The runner scales by `speed` and `prefers-reduced-motion`.
 *   render(t, input) — pure render function. `t ∈ [0, 1]`. The
 *                 scene may also reach into `input` (the previous
 *                 scene's output, typed as `I`) to compose its
 *                 visuals. Must return React nodes only — no
 *                 side effects, no useState, no event listeners.
 *                 (Stateful sub-components are fine; just don't
 *                 mutate scene state.)
 *   transform(input) — pure derivation: given this scene's input
 *                 state, produce the output state that becomes
 *                 the next scene's input. Called once per scene
 *                 transition by the runner.
 */
export interface Scene<I, O> {
    id: SceneId;
    durationMs: number;
    render: (t: number, input: I) => ReactNode;
    transform: (input: I) => O;
}

/**
 * Output of Scene 17 (token-emerge) feeds back into Scene 5
 * (embedding-lookup) on the autoregressive loop. The runner
 * detects this and re-enters the loop instead of advancing past
 * Scene 20. Until that wiring lands in chunk 9, the type just
 * gives the loop's shape.
 */
export interface AutoRegressiveStep<I> {
    tokenIndex: number;
    chosenTokenId: number;
    chosenTokenString: string;
    /** Input that started this generation step. */
    initialInput: I;
}
