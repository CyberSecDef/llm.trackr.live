import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENE_ATTENTION } from '@/Components/Viz/scenes';
import { syntheticEmbedding, layerNormalize } from '@/lib/syntheticEmbedding';
import type { BpeToken } from '@/lib/tokenizer';

const renderScene = (t: number, state: Parameters<typeof SCENE_ATTENTION.render>[1]) =>
    render(<>{SCENE_ATTENTION.render(t, state)}</>);

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

const SAMPLE_TOKENS: BpeToken[] = [tok(1, 'hello'), tok(2, ' '), tok(3, 'world'), tok(4, '!')];

const SAMPLE_EMBEDDINGS = SAMPLE_TOKENS.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));

describe('Scene 8 — multi-head self-attention', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_ATTENTION.id).toBe('attention');
        expect(SCENE_ATTENTION.durationMs).toBeGreaterThan(0);
        expect(typeof SCENE_ATTENTION.render).toBe('function');
        expect(typeof SCENE_ATTENTION.transform).toBe('function');
    });

    it('renders the scene caption at any t', () => {
        renderScene(0.5, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        expect(screen.getByTestId('scene-8-caption')).toBeInTheDocument();
    });

    it('phase 8a is visible at t=0.1 (Q/K/V rows)', () => {
        renderScene(0.1, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        expect(screen.getByTestId('scene-8a-qkv')).toBeInTheDocument();
        expect(screen.getByTestId('scene-8a-row-q')).toBeInTheDocument();
        expect(screen.getByTestId('scene-8a-row-k')).toBeInTheDocument();
        expect(screen.getByTestId('scene-8a-row-v')).toBeInTheDocument();
    });

    it('phase 8b is visible mid-scene (t=0.45, multi-head matrices)', () => {
        renderScene(0.45, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        expect(screen.getByTestId('scene-8b-multihead')).toBeInTheDocument();
        const heads = screen.getAllByTestId(/^scene-8b-head-\d+$/);
        expect(heads.length).toBe(6); // REPRESENTATIVE_HEAD_COUNT
    });

    it('phase 8b caption shows "showing N of M heads"', () => {
        renderScene(0.45, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        const cap = screen.getByTestId('scene-8b-head-caption');
        expect(cap.textContent).toMatch(/showing 6 of 32 heads/i);
    });

    it('phase 8c is visible at t=1 (V-blend output strips)', () => {
        renderScene(1, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        expect(screen.getByTestId('scene-8c-output')).toBeInTheDocument();
        const rows = screen.getAllByTestId(/scene-8c-row-/);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThanOrEqual(8);
    });

    it('phase 8a is hidden well past the 8a window (t=0.6)', () => {
        renderScene(0.6, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        expect(screen.queryByTestId('scene-8a-qkv')).not.toBeInTheDocument();
    });

    it('phase 8c is hidden during 8a (t=0.05)', () => {
        renderScene(0.05, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        expect(screen.queryByTestId('scene-8c-output')).not.toBeInTheDocument();
    });

    it('softmax wave appears in head 0 during 8b', () => {
        renderScene(0.45, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        expect(screen.getByTestId('scene-8b-softmax-wave')).toBeInTheDocument();
    });

    it('transform() populates all four PipelineState fields', () => {
        const out = SCENE_ATTENTION.transform({
            tokens: SAMPLE_TOKENS,
            layerNormed: SAMPLE_EMBEDDINGS,
        });
        expect(out.qkv).toBeDefined();
        expect(out.qkv).toHaveLength(SAMPLE_TOKENS.length);
        expect(out.attentionHeadMatrices).toBeDefined();
        expect(out.attentionHeadMatrices).toHaveLength(6);
        expect(out.attentionScores).toBeDefined();
        expect(out.attentionOutput).toBeDefined();
        expect(out.attentionOutput).toHaveLength(SAMPLE_TOKENS.length);
    });

    it('transform() is idempotent (same reference when fully populated)', () => {
        const first = SCENE_ATTENTION.transform({
            tokens: SAMPLE_TOKENS,
            layerNormed: SAMPLE_EMBEDDINGS,
        });
        const second = SCENE_ATTENTION.transform(first);
        expect(second).toBe(first);
    });

    it('transform() falls back through positionEncoded → embeddings → tokens', () => {
        // No layerNormed, no positionEncoded: should derive from embeddings
        const out = SCENE_ATTENTION.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        expect(out.attentionOutput).toBeDefined();
        expect(out.attentionOutput).toHaveLength(SAMPLE_TOKENS.length);
    });

    it('transform() passes through unchanged when no tokens', () => {
        const input = { promptText: 'foo' };
        expect(SCENE_ATTENTION.transform(input)).toBe(input);
    });

    it('Q/K/V rows render at most 8 tokens', () => {
        const manyTokens = Array.from({ length: 15 }, (_, i) => tok(i + 1, `t${i}`));
        const manyEmbeddings = manyTokens.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));
        renderScene(0.1, { tokens: manyTokens, layerNormed: manyEmbeddings });
        // Each role row caps at 8 cells (scene-8a-cell-q-0 through scene-8a-cell-q-7)
        const qCells = screen.getAllByTestId(/scene-8a-cell-q-/);
        expect(qCells.length).toBe(8);
    });

    it('output blend caps at 8 rows on long prompts', () => {
        const manyTokens = Array.from({ length: 15 }, (_, i) => tok(i + 1, `t${i}`));
        const manyEmbeddings = manyTokens.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));
        renderScene(1, { tokens: manyTokens, layerNormed: manyEmbeddings });
        const rows = screen.getAllByTestId(/scene-8c-row-/);
        expect(rows.length).toBe(8);
    });

    it('renders attention-weight pull-in dots only on rows 0/1/2', () => {
        renderScene(1, { tokens: SAMPLE_TOKENS, layerNormed: SAMPLE_EMBEDDINGS });
        expect(screen.queryAllByTestId(/scene-8c-pull-0-/).length).toBeGreaterThan(0);
        expect(screen.queryAllByTestId(/scene-8c-pull-2-/).length).toBeGreaterThan(0);
        // Row 3 should not have pull dots (i < 3 gate)
        expect(screen.queryAllByTestId(/scene-8c-pull-3-/).length).toBe(0);
    });
});
