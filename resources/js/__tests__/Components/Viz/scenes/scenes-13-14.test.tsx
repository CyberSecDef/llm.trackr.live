import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENE_FINAL_NORM, SCENE_LM_HEAD } from '@/Components/Viz/scenes';
import { syntheticEmbedding, layerNormalize } from '@/lib/syntheticEmbedding';
import type { BpeToken } from '@/lib/tokenizer';

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

const SAMPLE_TOKENS: BpeToken[] = [tok(1, 'hello'), tok(2, ' '), tok(3, 'world')];

const SAMPLE_VECTORS = SAMPLE_TOKENS.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));

describe('Scene 13 — final layer norm', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_FINAL_NORM.id).toBe('final-norm');
        expect(SCENE_FINAL_NORM.durationMs).toBe(500);
    });

    it('renders the scene caption', () => {
        render(
            <>
                {SCENE_FINAL_NORM.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput2: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-13-caption')).toBeInTheDocument();
        expect(screen.getByTestId('scene-13-caption').textContent).toMatch(/Final layer norm/i);
    });

    it('renders a row per token, capped at 6', () => {
        const many = Array.from({ length: 10 }, (_, i) => tok(i + 1, `t${i}`));
        const manyVecs = many.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));
        render(
            <>
                {SCENE_FINAL_NORM.render(0.5, {
                    tokens: many,
                    residualOutput2: manyVecs,
                })}
            </>,
        );
        const rows = screen.getAllByTestId(/^scene-13-row-\d+$/);
        expect(rows.length).toBe(6);
    });

    it('bars + strip layers crossfade with t (both null at t=0)', () => {
        const { container } = render(
            <>
                {SCENE_FINAL_NORM.render(0, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput2: SAMPLE_VECTORS,
                })}
            </>,
        );
        const barCharts = container.querySelectorAll('[data-testid="scene-13-barchart"]');
        const heatStrips = container.querySelectorAll('[data-testid="scene-13-heatstrip"]');
        expect(barCharts.length + heatStrips.length).toBe(0);
    });

    it('heat strip is visible at t=1', () => {
        const { container } = render(
            <>
                {SCENE_FINAL_NORM.render(1, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput2: SAMPLE_VECTORS,
                })}
            </>,
        );
        const heatStrips = container.querySelectorAll('[data-testid="scene-13-heatstrip"]');
        expect(heatStrips.length).toBeGreaterThan(0);
    });

    it('transform populates finalNormed', () => {
        const out = SCENE_FINAL_NORM.transform({
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
        });
        expect(out.finalNormed).toBeDefined();
        expect(out.finalNormed).toHaveLength(SAMPLE_TOKENS.length);
    });

    it('transform is idempotent', () => {
        const first = SCENE_FINAL_NORM.transform({
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
        });
        const second = SCENE_FINAL_NORM.transform(first);
        expect(second).toBe(first);
    });

    it('transform falls back through residualOutput → ffnOutput → … when residualOutput2 missing', () => {
        const out = SCENE_FINAL_NORM.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_VECTORS,
        });
        expect(out.finalNormed).toBeDefined();
    });
});

describe('Scene 14 — LM head', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_LM_HEAD.id).toBe('lm-head');
        expect(SCENE_LM_HEAD.durationMs).toBe(3000);
    });

    it('renders caption + LM Head matrix label (defaults to 128k)', () => {
        render(
            <>
                {SCENE_LM_HEAD.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    finalNormed: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-14-caption')).toBeInTheDocument();
        const matrixRegion = screen.getByTestId('scene-14-matrix-region');
        expect(matrixRegion.textContent).toMatch(/LM Head/i);
        expect(matrixRegion.textContent).toMatch(/4096 × 128,000/);
    });

    it('matrix label uses vocabSize from state when present', () => {
        render(
            <>
                {SCENE_LM_HEAD.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    finalNormed: SAMPLE_VECTORS,
                    vocabSize: 50_000,
                })}
            </>,
        );
        const matrixRegion = screen.getByTestId('scene-14-matrix-region');
        expect(matrixRegion.textContent).toMatch(/4096 × 50,000/);
    });

    it('highlights the last token strip', () => {
        render(
            <>
                {SCENE_LM_HEAD.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    finalNormed: SAMPLE_VECTORS,
                })}
            </>,
        );
        // Last token's strip has the -last suffix on its testId.
        const lastStrip = screen.getByTestId(`scene-14-strip-${SAMPLE_TOKENS.length - 1}-last`);
        expect(lastStrip).toBeInTheDocument();
    });

    it('beam appears during projection phase (t=0.6)', () => {
        render(
            <>
                {SCENE_LM_HEAD.render(0.6, {
                    tokens: SAMPLE_TOKENS,
                    finalNormed: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-14-beam')).toBeInTheDocument();
    });

    it('beam absent before projection phase (t=0.2)', () => {
        render(
            <>
                {SCENE_LM_HEAD.render(0.2, {
                    tokens: SAMPLE_TOKENS,
                    finalNormed: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-14-beam')).not.toBeInTheDocument();
    });

    it('logits heatmap visible at t=1', () => {
        render(
            <>
                {SCENE_LM_HEAD.render(1, {
                    tokens: SAMPLE_TOKENS,
                    finalNormed: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-14-logits')).toBeInTheDocument();
        expect(screen.getByTestId('scene-14-logits-heatmap')).toBeInTheDocument();
    });

    it('logits heatmap hidden before reveal phase (t=0.5)', () => {
        render(
            <>
                {SCENE_LM_HEAD.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    finalNormed: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-14-logits')).not.toBeInTheDocument();
    });

    it('transform populates logits + vocabSize', () => {
        const out = SCENE_LM_HEAD.transform({
            tokens: SAMPLE_TOKENS,
            finalNormed: SAMPLE_VECTORS,
        });
        expect(out.logits).toBeDefined();
        expect(out.logits!.length).toBe(128_000);
        expect(out.vocabSize).toBe(128_000);
    });

    it('transform honors a custom vocabSize from state', () => {
        const out = SCENE_LM_HEAD.transform({
            tokens: SAMPLE_TOKENS,
            finalNormed: SAMPLE_VECTORS,
            vocabSize: 50_000,
        });
        expect(out.logits!.length).toBe(50_000);
        expect(out.vocabSize).toBe(50_000);
    });

    it('transform is idempotent', () => {
        const first = SCENE_LM_HEAD.transform({
            tokens: SAMPLE_TOKENS,
            finalNormed: SAMPLE_VECTORS,
        });
        const second = SCENE_LM_HEAD.transform(first);
        expect(second).toBe(first);
    });

    it('transform falls back through state when finalNormed missing', () => {
        const out = SCENE_LM_HEAD.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_VECTORS,
        });
        expect(out.logits).toBeDefined();
    });
});
