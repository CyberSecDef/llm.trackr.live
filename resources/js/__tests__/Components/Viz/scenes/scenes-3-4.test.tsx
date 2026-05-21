import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCENE_BPE_TOKENIZE, SCENE_TOKEN_IDS } from '@/Components/Viz/scenes';
import { _resetTokenizerCache, getCachedTokenizer, loadTokenizer } from '@/lib/tokenizer';

const renderScene = (
    scene: typeof SCENE_BPE_TOKENIZE | typeof SCENE_TOKEN_IDS,
    t: number,
    state: Parameters<typeof scene.render>[1],
) => render(<>{scene.render(t, state)}</>);

beforeEach(async () => {
    // Warm up the tokenizer so Scene 3's getCachedTokenizer() returns
    // the real cl100k_base encoder (not the null placeholder).
    await loadTokenizer();
});

afterEach(() => {
    _resetTokenizerCache();
});

describe('Scene 3 — bpe-tokenize', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_BPE_TOKENIZE.id).toBe('bpe-tokenize');
        expect(SCENE_BPE_TOKENIZE.durationMs).toBeGreaterThan(0);
    });

    it('shows "tokenizing…" placeholder when no tokens AND no cache', () => {
        _resetTokenizerCache();
        renderScene(SCENE_BPE_TOKENIZE, 0, { promptText: 'hi' });
        expect(screen.getByText(/Tokenizing/i)).toBeInTheDocument();
    });

    it('renders tokens when state.tokens is populated', () => {
        const tokens = getCachedTokenizer()!.encode('hello world');
        renderScene(SCENE_BPE_TOKENIZE, 1, { promptText: 'hello world', tokens });
        // All tokens should be rendered at t=1 (pill state).
        expect(screen.getAllByTestId(/scene-3-token-/).length).toBe(tokens.length);
    });

    it('encodes via cached tokenizer when state.tokens is missing but cache is warm', () => {
        renderScene(SCENE_BPE_TOKENIZE, 1, { promptText: 'hello world' });
        // Cache-warmed tokenizer produces tokens; expect at least one.
        expect(screen.queryAllByTestId(/scene-3-token-/).length).toBeGreaterThan(0);
    });

    it('transform populates state.tokens + contextLength from cached tokenizer', () => {
        const out = SCENE_BPE_TOKENIZE.transform({ promptText: 'hello world' });
        expect(out.tokens).toBeDefined();
        expect(out.tokens!.length).toBeGreaterThan(0);
        expect(out.contextLength).toBe(out.tokens!.length);
    });

    it('transform is idempotent: re-applying keeps the same tokens reference', () => {
        const first = SCENE_BPE_TOKENIZE.transform({ promptText: 'hi' });
        const second = SCENE_BPE_TOKENIZE.transform(first);
        expect(second).toBe(first); // identity
    });

    it('transform passes through unchanged when tokenizer is not cached', () => {
        _resetTokenizerCache();
        const input = { promptText: 'hi' };
        const out = SCENE_BPE_TOKENIZE.transform(input);
        expect(out.tokens).toBeUndefined();
    });
});

describe('Scene 4 — token-ids', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_TOKEN_IDS.id).toBe('token-ids');
        expect(SCENE_TOKEN_IDS.durationMs).toBeGreaterThan(0);
    });

    it('renders the context-length label with the integer token count', async () => {
        const tokens = getCachedTokenizer()!.encode('hello world');
        renderScene(SCENE_TOKEN_IDS, 1, {
            promptText: 'hello world',
            tokens,
            contextLength: tokens.length,
        });
        await waitFor(() => {
            const label = screen.getByTestId('scene-4-context-length-label');
            expect(label.textContent).toContain('Context length:');
            expect(label.textContent).toContain(String(tokens.length));
        });
    });

    it('renders one TokenPill per token', () => {
        const tokens = getCachedTokenizer()!.encode('hello world');
        renderScene(SCENE_TOKEN_IDS, 1, {
            promptText: 'hello world',
            tokens,
            contextLength: tokens.length,
        });
        const pills = screen.getAllByTestId('token-pill');
        expect(pills).toHaveLength(tokens.length);
    });

    it('transform is the identity', () => {
        const input = { promptText: 'x', tokens: [], contextLength: 0 };
        expect(SCENE_TOKEN_IDS.transform(input)).toBe(input);
    });
});
