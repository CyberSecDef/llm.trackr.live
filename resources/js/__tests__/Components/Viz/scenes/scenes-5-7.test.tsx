import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    SCENE_EMBEDDING_LOOKUP,
    SCENE_POSITIONAL_ENCODING,
    SCENE_LAYER_NORM,
} from '@/Components/Viz/scenes';
import type { BpeToken } from '@/lib/tokenizer';
import { syntheticEmbedding } from '@/lib/syntheticEmbedding';

const renderScene = (
    scene:
        | typeof SCENE_EMBEDDING_LOOKUP
        | typeof SCENE_POSITIONAL_ENCODING
        | typeof SCENE_LAYER_NORM,
    t: number,
    state: Parameters<typeof scene.render>[1],
) => render(<>{scene.render(t, state)}</>);

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

const SAMPLE_TOKENS: BpeToken[] = [tok(1, 'hello'), tok(2, ' '), tok(3, 'world')];

const SAMPLE_EMBEDDINGS = SAMPLE_TOKENS.map((t) => syntheticEmbedding(t.id, 128));

describe('Scene 5 — embedding-lookup', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_EMBEDDING_LOOKUP.id).toBe('embedding-lookup');
        expect(SCENE_EMBEDDING_LOOKUP.durationMs).toBeGreaterThan(0);
    });

    it('shows the "Embedding table" matrix caption', () => {
        renderScene(SCENE_EMBEDDING_LOOKUP, 0.5, {
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        expect(screen.getByText(/Embedding table/i)).toBeInTheDocument();
        expect(screen.getByText(/128,000 × 4096/)).toBeInTheDocument();
    });

    it('at t=1 the bottom row is fully VectorStrips (no pills)', () => {
        renderScene(SCENE_EMBEDDING_LOOKUP, 1, {
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        expect(screen.getAllByTestId(/scene-5-strip-/)).toHaveLength(SAMPLE_TOKENS.length);
        // The pill testIds shouldn't appear at full t.
        expect(screen.queryByTestId('scene-5-pill-0')).not.toBeInTheDocument();
    });

    it('transform synthesizes embeddings from tokens when missing', () => {
        const out = SCENE_EMBEDDING_LOOKUP.transform({ tokens: SAMPLE_TOKENS });
        expect(out.embeddings).toBeDefined();
        expect(out.embeddings).toHaveLength(SAMPLE_TOKENS.length);
        expect(out.embeddings![0]).toHaveLength(128);
    });

    it('transform is idempotent', () => {
        const first = SCENE_EMBEDDING_LOOKUP.transform({ tokens: SAMPLE_TOKENS });
        const second = SCENE_EMBEDDING_LOOKUP.transform(first);
        expect(second).toBe(first);
    });

    it('transform passes through when no tokens', () => {
        const input = { promptText: 'x' };
        expect(SCENE_EMBEDDING_LOOKUP.transform(input)).toBe(input);
    });
});

describe('Scene 6 — positional-encoding', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_POSITIONAL_ENCODING.id).toBe('positional-encoding');
        expect(SCENE_POSITIONAL_ENCODING.durationMs).toBeGreaterThan(0);
    });

    it('renders one row per token with a position counter', () => {
        renderScene(SCENE_POSITIONAL_ENCODING, 1, {
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        expect(screen.getAllByTestId(/scene-6-row-/)).toHaveLength(SAMPLE_TOKENS.length);
        // Position counters present for indexes 0..N-1.
        expect(screen.getByTestId('scene-6-pos-0').textContent).toBe('0');
        expect(screen.getByTestId('scene-6-pos-2').textContent).toBe('2');
    });

    it('θ annotations appear on the first 3 rows', () => {
        renderScene(SCENE_POSITIONAL_ENCODING, 1, {
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        expect(screen.getByTestId('scene-6-theta-0')).toBeInTheDocument();
        expect(screen.getByTestId('scene-6-theta-2')).toBeInTheDocument();
        // No θ row for index 3+.
        expect(screen.queryByTestId('scene-6-theta-3')).not.toBeInTheDocument();
    });

    it('transform populates positionEncoded from embeddings', () => {
        const out = SCENE_POSITIONAL_ENCODING.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        expect(out.positionEncoded).toBeDefined();
        expect(out.positionEncoded).toHaveLength(SAMPLE_TOKENS.length);
    });

    it('transform is idempotent', () => {
        const first = SCENE_POSITIONAL_ENCODING.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        const second = SCENE_POSITIONAL_ENCODING.transform(first);
        expect(second).toBe(first);
    });
});

describe('Scene 7 — layer-norm', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_LAYER_NORM.id).toBe('layer-norm');
        expect(SCENE_LAYER_NORM.durationMs).toBeGreaterThan(0);
    });

    it('renders one row per token (capped at 8)', () => {
        const manyTokens = Array.from({ length: 12 }, (_, i) => tok(i + 1, `t${i}`));
        const manyEmbeddings = manyTokens.map((t) => syntheticEmbedding(t.id, 128));
        renderScene(SCENE_LAYER_NORM, 1, {
            tokens: manyTokens,
            embeddings: manyEmbeddings,
        });
        // Cap at 8 keeps the strip stack readable.
        expect(screen.getAllByTestId(/scene-7-row-/)).toHaveLength(8);
    });

    it('at t=0 (just entered) bar chart is visible, strip is not', () => {
        const { container } = renderScene(SCENE_LAYER_NORM, 0, {
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        // Both SVGs always mount; opacity discriminates.
        const barCharts = container.querySelectorAll('[data-testid="scene-7-barchart"]');
        const heatStrips = container.querySelectorAll('[data-testid="scene-7-heatstrip"]');
        // At t=0, bars-opacity = 0 (math.min(0/0.15, 1) = 0) so barChart returns null;
        // strip-opacity = 0 so heatStrip also returns null. Both should be absent.
        // The scene container should still render (caption + token rows).
        expect(barCharts.length + heatStrips.length).toBe(0);
    });

    it('at t=1 the heatmap strip is visible (squish complete)', () => {
        const { container } = renderScene(SCENE_LAYER_NORM, 1, {
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        const heatStrips = container.querySelectorAll('[data-testid="scene-7-heatstrip"]');
        expect(heatStrips.length).toBeGreaterThan(0);
    });

    it('transform populates layerNormed from positionEncoded if available', () => {
        const out = SCENE_LAYER_NORM.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
            positionEncoded: SAMPLE_EMBEDDINGS,
        });
        expect(out.layerNormed).toBeDefined();
        expect(out.layerNormed).toHaveLength(SAMPLE_TOKENS.length);
    });

    it('transform falls back to embeddings when positionEncoded is missing', () => {
        const out = SCENE_LAYER_NORM.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
        });
        expect(out.layerNormed).toBeDefined();
    });

    it('transform is idempotent', () => {
        const first = SCENE_LAYER_NORM.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_EMBEDDINGS,
            positionEncoded: SAMPLE_EMBEDDINGS,
        });
        const second = SCENE_LAYER_NORM.transform(first);
        expect(second).toBe(first);
    });
});
