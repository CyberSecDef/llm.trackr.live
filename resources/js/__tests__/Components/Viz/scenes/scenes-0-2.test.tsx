import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    SCENE_PROMPT_ENTRY,
    SCENE_CHARS_TO_BYTES,
    SCENE_CHAT_TEMPLATE,
} from '@/Components/Viz/scenes';

const renderScene = (
    scene: typeof SCENE_PROMPT_ENTRY,
    t: number,
    state: Parameters<typeof scene.render>[1],
) => render(<>{scene.render(t, state)}</>);

describe('Scene 0 — prompt-entry', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_PROMPT_ENTRY.id).toBe('prompt-entry');
        expect(SCENE_PROMPT_ENTRY.durationMs).toBeGreaterThan(0);
        expect(typeof SCENE_PROMPT_ENTRY.render).toBe('function');
        expect(typeof SCENE_PROMPT_ENTRY.transform).toBe('function');
    });

    it('at t=0 shows the textbox with no characters typed', () => {
        renderScene(SCENE_PROMPT_ENTRY, 0, { promptText: 'hello world' });
        expect(screen.getByTestId('scene-0-textbox')).toBeInTheDocument();
        const typed = screen.getByTestId('scene-0-typed-text');
        expect(typed.textContent?.trim().replace('▍', '').trim()).toBe('');
    });

    it('at t=0.5 shows partial typed text (~half the prompt)', () => {
        renderScene(SCENE_PROMPT_ENTRY, 0.5, { promptText: '0123456789' });
        const typed = screen.getByTestId('scene-0-typed-text');
        // Typing phase ends at t=0.75, so t=0.5 → 0.5/0.75 ≈ 0.67 → 6 chars.
        const visible = typed.textContent?.replace('▍', '').trim() ?? '';
        expect(visible.length).toBeGreaterThan(2);
        expect(visible.length).toBeLessThan(10);
    });

    it('at t=1 shows all characters fully typed + floating-chars overlay', () => {
        renderScene(SCENE_PROMPT_ENTRY, 1, { promptText: 'hi' });
        expect(screen.getByTestId('scene-0-floating-chars')).toBeInTheDocument();
    });

    it('transform is the identity (promptText already in state)', () => {
        const input = { promptText: 'x' };
        expect(SCENE_PROMPT_ENTRY.transform(input)).toBe(input);
    });
});

describe('Scene 1 — chars-to-bytes', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_CHARS_TO_BYTES.id).toBe('chars-to-bytes');
        expect(SCENE_CHARS_TO_BYTES.durationMs).toBeGreaterThan(0);
    });

    it('renders one cell per char in the prompt', () => {
        renderScene(SCENE_CHARS_TO_BYTES, 0, { promptText: 'hi😀' });
        // 3 codepoints (h, i, emoji).
        expect(screen.getAllByTestId(/scene-1-cell-/)).toHaveLength(3);
    });

    it('flags multi-byte cells with a multibyte tag at the byte phase', () => {
        // t late enough that all cells have flipped to bytes.
        renderScene(SCENE_CHARS_TO_BYTES, 1, { promptText: 'h😀' });
        // 'h' is 1-byte → no tag. '😀' is 4-byte → tag should appear.
        expect(screen.queryByTestId('scene-1-multibyte-tag-0')).not.toBeInTheDocument();
        expect(screen.getByTestId('scene-1-multibyte-tag-1')).toHaveTextContent('4-byte');
    });

    it('transform adds charBytes to PipelineState', () => {
        const out = SCENE_CHARS_TO_BYTES.transform({ promptText: 'h' });
        expect(out.charBytes).toBeDefined();
        expect(out.charBytes).toHaveLength(1);
        expect(out.charBytes![0].bytes).toEqual([104]);
    });

    it('transform is idempotent: re-applying does not re-encode', () => {
        const first = SCENE_CHARS_TO_BYTES.transform({ promptText: 'h' });
        const second = SCENE_CHARS_TO_BYTES.transform(first);
        // Reference equality: cached charBytes carries forward.
        expect(second.charBytes).toBe(first.charBytes);
    });
});

describe('Scene 2 — chat-template', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_CHAT_TEMPLATE.id).toBe('chat-template');
        expect(SCENE_CHAT_TEMPLATE.durationMs).toBeGreaterThan(0);
    });

    it('at t=0 shows the system block partially in (just starting to slide)', () => {
        renderScene(SCENE_CHAT_TEMPLATE, 0, { promptText: 'hi' });
        expect(screen.getByTestId('scene-2-system')).toBeInTheDocument();
    });

    it('at t=0.4 system block is fully in + user marker is sliding', () => {
        renderScene(SCENE_CHAT_TEMPLATE, 0.4, { promptText: 'hi' });
        expect(screen.getByTestId('scene-2-system')).toBeInTheDocument();
        expect(screen.getByTestId('scene-2-user-marker')).toBeInTheDocument();
    });

    it('at t=1 all 4 sections rendered as bytes (collapse complete)', () => {
        renderScene(SCENE_CHAT_TEMPLATE, 1, { promptText: 'hi' });
        expect(screen.getByTestId('scene-2-system-bytes')).toBeInTheDocument();
        expect(screen.getByTestId('scene-2-user-marker-bytes')).toBeInTheDocument();
        expect(screen.getByTestId('scene-2-user-prompt-bytes')).toBeInTheDocument();
        expect(screen.getByTestId('scene-2-assistant-marker-bytes')).toBeInTheDocument();
    });

    it('transform adds chatTemplateBytes + chatTemplateTints', () => {
        const out = SCENE_CHAT_TEMPLATE.transform({ promptText: 'hi' });
        expect(out.chatTemplateBytes).toBeDefined();
        expect(out.chatTemplateTints).toBeDefined();
        expect(out.chatTemplateBytes!.length).toBeGreaterThan(0);
        expect(out.chatTemplateBytes!.length).toBe(out.chatTemplateTints!.length);
        // The user prompt's bytes appear in the middle of the stream;
        // tints should mark them as 'user-prompt'.
        const userPromptTints = out.chatTemplateTints!.filter((t) => t === 'user-prompt');
        // 'hi' = 2 bytes → 2 user-prompt tints.
        expect(userPromptTints).toHaveLength(2);
    });

    it('transform handles empty prompt', () => {
        const out = SCENE_CHAT_TEMPLATE.transform({ promptText: '' });
        // System bytes + user-marker bytes + 0 user-prompt bytes + assistant-marker bytes.
        expect(out.chatTemplateBytes!.length).toBeGreaterThan(0);
        const userPromptTints = out.chatTemplateTints!.filter((t) => t === 'user-prompt');
        expect(userPromptTints).toHaveLength(0);
    });
});
