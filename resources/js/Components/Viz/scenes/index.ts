import type { PipelineState, Scene } from '@/Components/Viz/Scene';
import { SCENE_PROMPT_ENTRY } from '@/Components/Viz/scenes/PromptEntryScene';
import { SCENE_CHARS_TO_BYTES } from '@/Components/Viz/scenes/CharsToBytesScene';
import { SCENE_CHAT_TEMPLATE } from '@/Components/Viz/scenes/ChatTemplateScene';
import { SCENE_BPE_TOKENIZE } from '@/Components/Viz/scenes/BpeTokenizeScene';
import { SCENE_TOKEN_IDS } from '@/Components/Viz/scenes/TokenIdsScene';
import { SCENE_EMBEDDING_LOOKUP } from '@/Components/Viz/scenes/EmbeddingLookupScene';
import { SCENE_POSITIONAL_ENCODING } from '@/Components/Viz/scenes/PositionalEncodingScene';
import { SCENE_LAYER_NORM } from '@/Components/Viz/scenes/LayerNormScene';
import { SCENE_ATTENTION } from '@/Components/Viz/scenes/AttentionScene';
import { SCENE_RESIDUAL_1, SCENE_RESIDUAL_2 } from '@/Components/Viz/scenes/ResidualScene';
import { SCENE_FFN } from '@/Components/Viz/scenes/FFNScene';
import { SCENE_LAYER_STACK } from '@/Components/Viz/scenes/LayerStackScene';
import { SCENE_FINAL_NORM } from '@/Components/Viz/scenes/FinalNormScene';
import { SCENE_LM_HEAD } from '@/Components/Viz/scenes/LMHeadScene';
import { SCENE_SOFTMAX } from '@/Components/Viz/scenes/SoftmaxScene';
import { SCENE_SAMPLING } from '@/Components/Viz/scenes/SamplingScene';
import { SCENE_TOKEN_EMERGE } from '@/Components/Viz/scenes/TokenEmergeScene';
import { SCENE_AUTOREGRESSIVE_LOOP } from '@/Components/Viz/scenes/AutoregressiveLoopScene';
import { SCENE_KV_CACHE } from '@/Components/Viz/scenes/KVCacheScene';
import { SCENE_DETOKENIZE } from '@/Components/Viz/scenes/DetokenizeScene';

/*
 * ALL_SCENES (M13 chunk 3+) — the ordered scene registry the
 * SceneRunner walks through. Each chunk adds entries:
 *   - chunk 3b: scenes 0, 1, 2
 *   - chunk 3c: scenes 3, 4
 *   - chunk 4:  scenes 5, 6, 7
 *   - chunk 5:  scene 8
 *   - chunk 6:  scenes 9, 10, 11
 *   - chunk 7:  scene 12
 *   - chunk 8a: scenes 13, 14
 *   - chunk 8b: scenes 15, 16, 17
 *   - chunk 9a: scene 18
 *   - chunk 9b: scenes 19, 20 (this commit)
 *
 * Unregistered scene slots fall through to the CinematicViz
 * placeholder ("Scene not yet implemented") — sceneIndex still
 * advances correctly via SCENE_IDS-driven duration defaults.
 */
export const ALL_SCENES: ReadonlyArray<Scene<PipelineState, PipelineState>> = [
    SCENE_PROMPT_ENTRY, // 0
    SCENE_CHARS_TO_BYTES, // 1
    SCENE_CHAT_TEMPLATE, // 2
    SCENE_BPE_TOKENIZE, // 3
    SCENE_TOKEN_IDS, // 4
    SCENE_EMBEDDING_LOOKUP, // 5
    SCENE_POSITIONAL_ENCODING, // 6
    SCENE_LAYER_NORM, // 7
    SCENE_ATTENTION, // 8
    SCENE_RESIDUAL_1, // 9
    SCENE_FFN, // 10
    SCENE_RESIDUAL_2, // 11
    SCENE_LAYER_STACK, // 12
    SCENE_FINAL_NORM, // 13
    SCENE_LM_HEAD, // 14
    SCENE_SOFTMAX, // 15
    SCENE_SAMPLING, // 16
    SCENE_TOKEN_EMERGE, // 17
    SCENE_AUTOREGRESSIVE_LOOP, // 18
    SCENE_KV_CACHE, // 19
    SCENE_DETOKENIZE, // 20
];

export {
    SCENE_PROMPT_ENTRY,
    SCENE_CHARS_TO_BYTES,
    SCENE_CHAT_TEMPLATE,
    SCENE_BPE_TOKENIZE,
    SCENE_TOKEN_IDS,
    SCENE_EMBEDDING_LOOKUP,
    SCENE_POSITIONAL_ENCODING,
    SCENE_LAYER_NORM,
    SCENE_ATTENTION,
    SCENE_RESIDUAL_1,
    SCENE_FFN,
    SCENE_RESIDUAL_2,
    SCENE_LAYER_STACK,
    SCENE_FINAL_NORM,
    SCENE_LM_HEAD,
    SCENE_SOFTMAX,
    SCENE_SAMPLING,
    SCENE_TOKEN_EMERGE,
    SCENE_AUTOREGRESSIVE_LOOP,
    SCENE_KV_CACHE,
    SCENE_DETOKENIZE,
};
