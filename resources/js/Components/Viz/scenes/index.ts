import type { PipelineState, Scene } from '@/Components/Viz/Scene';
import { SCENE_PROMPT_ENTRY } from '@/Components/Viz/scenes/PromptEntryScene';
import { SCENE_CHARS_TO_BYTES } from '@/Components/Viz/scenes/CharsToBytesScene';
import { SCENE_CHAT_TEMPLATE } from '@/Components/Viz/scenes/ChatTemplateScene';

/*
 * ALL_SCENES (M13 chunk 3+) — the ordered scene registry the
 * SceneRunner walks through. Each chunk adds entries:
 *   - chunk 3b: scenes 0, 1, 2 (this commit)
 *   - chunk 3c: scenes 3, 4
 *   - chunk 4:  scenes 5, 6, 7
 *   - chunk 5:  scene 8
 *   - chunk 6:  scenes 9, 10, 11
 *   - chunk 7:  scene 12
 *   - chunk 8:  scenes 13, 14, 15, 16, 17
 *   - chunk 9:  scenes 18, 19, 20
 *
 * Unregistered scene slots fall through to the CinematicViz
 * placeholder ("Scene not yet implemented") — sceneIndex still
 * advances correctly via SCENE_IDS-driven duration defaults.
 */
export const ALL_SCENES: ReadonlyArray<Scene<PipelineState, PipelineState>> = [
    SCENE_PROMPT_ENTRY, // 0
    SCENE_CHARS_TO_BYTES, // 1
    SCENE_CHAT_TEMPLATE, // 2
];

export { SCENE_PROMPT_ENTRY, SCENE_CHARS_TO_BYTES, SCENE_CHAT_TEMPLATE };
