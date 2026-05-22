import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENE_FFN, SCENE_RESIDUAL_1, SCENE_RESIDUAL_2 } from '@/Components/Viz/scenes';
import { syntheticEmbedding, layerNormalize } from '@/lib/syntheticEmbedding';
import type { BpeToken } from '@/lib/tokenizer';

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

const SAMPLE_TOKENS: BpeToken[] = [tok(1, 'hello'), tok(2, ' '), tok(3, 'world')];

const SAMPLE_VECTORS = SAMPLE_TOKENS.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));

describe('Scene 9 — residual (positionEncoded + attentionOutput)', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_RESIDUAL_1.id).toBe('residual-1');
        expect(SCENE_RESIDUAL_1.durationMs).toBe(1000);
    });

    it('renders the scene caption', () => {
        render(
            <>
                {SCENE_RESIDUAL_1.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    positionEncoded: SAMPLE_VECTORS,
                    attentionOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-9-caption')).toBeInTheDocument();
        expect(screen.getByTestId('scene-9-caption').textContent).toMatch(/Scene 9 · Residual/i);
    });

    it('renders + symbol per token row', () => {
        render(
            <>
                {SCENE_RESIDUAL_1.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    positionEncoded: SAMPLE_VECTORS,
                    attentionOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        const pluses = screen.getAllByTestId(/^scene-9-plus-\d+$/);
        expect(pluses.length).toBe(SAMPLE_TOKENS.length);
    });

    it('output is hidden during the lean-in phase (t=0.5)', () => {
        render(
            <>
                {SCENE_RESIDUAL_1.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    positionEncoded: SAMPLE_VECTORS,
                    attentionOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-9-output')).not.toBeInTheDocument();
    });

    it('output is visible at t=1', () => {
        render(
            <>
                {SCENE_RESIDUAL_1.render(1, {
                    tokens: SAMPLE_TOKENS,
                    positionEncoded: SAMPLE_VECTORS,
                    attentionOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-9-output')).toBeInTheDocument();
        const outputRows = screen.getAllByTestId(/scene-9-output-row-/);
        expect(outputRows.length).toBe(SAMPLE_TOKENS.length);
    });

    it('transform() populates residualOutput', () => {
        const out = SCENE_RESIDUAL_1.transform({
            tokens: SAMPLE_TOKENS,
            positionEncoded: SAMPLE_VECTORS,
            attentionOutput: SAMPLE_VECTORS,
        });
        expect(out.residualOutput).toBeDefined();
        expect(out.residualOutput).toHaveLength(SAMPLE_TOKENS.length);
        // Each output should be the element-wise sum (so 2× the input here).
        expect(out.residualOutput![0][0]).toBeCloseTo(SAMPLE_VECTORS[0][0] * 2);
    });

    it('transform() is idempotent', () => {
        const first = SCENE_RESIDUAL_1.transform({
            tokens: SAMPLE_TOKENS,
            positionEncoded: SAMPLE_VECTORS,
            attentionOutput: SAMPLE_VECTORS,
        });
        const second = SCENE_RESIDUAL_1.transform(first);
        expect(second).toBe(first);
    });

    it('renders the ghost label "Pre-attention"', () => {
        const { container } = render(
            <>
                {SCENE_RESIDUAL_1.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    positionEncoded: SAMPLE_VECTORS,
                    attentionOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(container.textContent).toMatch(/Pre-attention/i);
        expect(container.textContent).toMatch(/Attention output/i);
    });

    it('caps render at 6 token rows', () => {
        const many = Array.from({ length: 10 }, (_, i) => tok(i + 1, `t${i}`));
        const manyVecs = many.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));
        render(
            <>
                {SCENE_RESIDUAL_1.render(0.5, {
                    tokens: many,
                    positionEncoded: manyVecs,
                    attentionOutput: manyVecs,
                })}
            </>,
        );
        const pluses = screen.getAllByTestId(/^scene-9-plus-\d+$/);
        expect(pluses.length).toBe(6);
    });
});

describe('Scene 10 — feed-forward network', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_FFN.id).toBe('ffn');
        expect(SCENE_FFN.durationMs).toBe(3000);
    });

    it('renders caption + non-linearity label (default GELU)', () => {
        render(
            <>
                {SCENE_FFN.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-10-caption')).toBeInTheDocument();
        const label = screen.getByTestId('scene-10-nonlinearity-label');
        expect(label.textContent).toMatch(/GELU/);
    });

    it('switches non-linearity label to SwiGLU for Llama-family', () => {
        render(
            <>
                {SCENE_FFN.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput: SAMPLE_VECTORS,
                    architectureType: 'llama',
                })}
            </>,
        );
        const label = screen.getByTestId('scene-10-nonlinearity-label');
        expect(label.textContent).toMatch(/SwiGLU/);
    });

    it('caps render at 4 token rows', () => {
        const many = Array.from({ length: 8 }, (_, i) => tok(i + 1, `t${i}`));
        const manyVecs = many.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));
        render(
            <>
                {SCENE_FFN.render(0.5, {
                    tokens: many,
                    residualOutput: manyVecs,
                })}
            </>,
        );
        const rows = screen.getAllByTestId(/^scene-10-row-\d+$/);
        expect(rows.length).toBe(4);
    });

    it('output label is visible at t=1', () => {
        render(
            <>
                {SCENE_FFN.render(1, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-10-output-label')).toBeInTheDocument();
    });

    it('output label is hidden before t=0.85', () => {
        render(
            <>
                {SCENE_FFN.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-10-output-label')).not.toBeInTheDocument();
    });

    it('renders pipe per token', () => {
        render(
            <>
                {SCENE_FFN.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        const pipes = screen.getAllByTestId(/^scene-10-pipe-\d+$/);
        expect(pipes.length).toBe(SAMPLE_TOKENS.length);
    });

    it('transform() populates ffnOutput', () => {
        const out = SCENE_FFN.transform({
            tokens: SAMPLE_TOKENS,
            residualOutput: SAMPLE_VECTORS,
        });
        expect(out.ffnOutput).toBeDefined();
        expect(out.ffnOutput).toHaveLength(SAMPLE_TOKENS.length);
        expect(out.ffnOutput![0]).toHaveLength(SAMPLE_VECTORS[0].length);
    });

    it('transform() falls back through attentionOutput → layerNormed → embeddings', () => {
        const out = SCENE_FFN.transform({
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_VECTORS,
        });
        expect(out.ffnOutput).toBeDefined();
    });

    it('transform() is idempotent', () => {
        const first = SCENE_FFN.transform({
            tokens: SAMPLE_TOKENS,
            residualOutput: SAMPLE_VECTORS,
        });
        const second = SCENE_FFN.transform(first);
        expect(second).toBe(first);
    });

    it('transform() passes through when no input vectors anywhere', () => {
        const input = { promptText: 'foo' };
        expect(SCENE_FFN.transform(input)).toBe(input);
    });
});

describe('Scene 11 — second residual (residualOutput + ffnOutput)', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_RESIDUAL_2.id).toBe('residual-2');
        expect(SCENE_RESIDUAL_2.durationMs).toBe(1000);
    });

    it('renders caption with Pre-FFN / FFN labels', () => {
        const { container } = render(
            <>
                {SCENE_RESIDUAL_2.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput: SAMPLE_VECTORS,
                    ffnOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-11-caption').textContent).toMatch(/Scene 11 · Residual/i);
        expect(container.textContent).toMatch(/Pre-FFN/i);
        expect(container.textContent).toMatch(/FFN output/i);
    });

    it('reuses the ResidualScene component (same testId shape)', () => {
        render(
            <>
                {SCENE_RESIDUAL_2.render(1, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput: SAMPLE_VECTORS,
                    ffnOutput: SAMPLE_VECTORS,
                })}
            </>,
        );
        // Same naming convention as scene-9: scene-11-plus-N, scene-11-output-N
        const pluses = screen.getAllByTestId(/^scene-11-plus-\d+$/);
        expect(pluses.length).toBe(SAMPLE_TOKENS.length);
        expect(screen.getByTestId('scene-11-output')).toBeInTheDocument();
    });

    it('transform() populates residualOutput2 (not residualOutput)', () => {
        const out = SCENE_RESIDUAL_2.transform({
            tokens: SAMPLE_TOKENS,
            residualOutput: SAMPLE_VECTORS,
            ffnOutput: SAMPLE_VECTORS,
        });
        expect(out.residualOutput2).toBeDefined();
        expect(out.residualOutput2).toHaveLength(SAMPLE_TOKENS.length);
    });

    it('transform() is idempotent', () => {
        const first = SCENE_RESIDUAL_2.transform({
            tokens: SAMPLE_TOKENS,
            residualOutput: SAMPLE_VECTORS,
            ffnOutput: SAMPLE_VECTORS,
        });
        const second = SCENE_RESIDUAL_2.transform(first);
        expect(second).toBe(first);
    });
});
