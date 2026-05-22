import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENE_SAMPLING, SCENE_SOFTMAX, SCENE_TOKEN_EMERGE } from '@/Components/Viz/scenes';
import { syntheticEmbedding, layerNormalize } from '@/lib/syntheticEmbedding';
import { synthesizeLogits } from '@/lib/syntheticLogits';
import type { BpeToken } from '@/lib/tokenizer';

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

const SAMPLE_TOKENS: BpeToken[] = [tok(1, 'hello'), tok(2, ' '), tok(3, 'world')];

const SAMPLE_VECTORS = SAMPLE_TOKENS.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));

const { values: SAMPLE_LOGITS } = synthesizeLogits(
    SAMPLE_VECTORS[SAMPLE_VECTORS.length - 1],
    1000,
    0xc0ffee,
);

describe('Scene 15 — softmax → probabilities', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_SOFTMAX.id).toBe('softmax');
        expect(SCENE_SOFTMAX.durationMs).toBe(2000);
    });

    it('renders caption + temperature label', () => {
        render(
            <>
                {SCENE_SOFTMAX.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-15-caption')).toBeInTheDocument();
        expect(screen.getByTestId('scene-15-temperature').textContent).toMatch(/Temperature/i);
    });

    it('renders top-K bars (16 by default)', () => {
        render(
            <>
                {SCENE_SOFTMAX.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                })}
            </>,
        );
        const bars = screen.getAllByTestId(/^scene-15-bar-\d+$/);
        expect(bars.length).toBe(16);
    });

    it('softmax wave line visible during mid-phase (t=0.5)', () => {
        render(
            <>
                {SCENE_SOFTMAX.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-15-wave-line')).toBeInTheDocument();
    });

    it('softmax wave hidden at t=0', () => {
        render(
            <>
                {SCENE_SOFTMAX.render(0, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-15-wave-line')).not.toBeInTheDocument();
    });

    it('transform populates probabilities', () => {
        const out = SCENE_SOFTMAX.transform({
            tokens: SAMPLE_TOKENS,
            logits: SAMPLE_LOGITS,
        });
        expect(out.probabilities).toBeDefined();
        expect(out.probabilities!.length).toBe(16);
        // Probabilities should sum to ~1 (top-K is just a slice of the
        // full distribution; the slice itself is a softmax over those K).
        const sum = out.probabilities!.reduce((s, b) => s + b.prob, 0);
        expect(sum).toBeCloseTo(1, 3);
    });

    it('transform is idempotent', () => {
        const first = SCENE_SOFTMAX.transform({
            tokens: SAMPLE_TOKENS,
            logits: SAMPLE_LOGITS,
        });
        const second = SCENE_SOFTMAX.transform(first);
        expect(second).toBe(first);
    });
});

describe('Scene 16 — sampling', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_SAMPLING.id).toBe('sampling');
        expect(SCENE_SAMPLING.durationMs).toBe(1500);
    });

    it('renders mode label "Greedy" by default', () => {
        render(
            <>
                {SCENE_SAMPLING.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-16-mode-label').textContent).toMatch(/Greedy/i);
    });

    it('renders mode label "Top-K" with k value when mode=top_k', () => {
        render(
            <>
                {SCENE_SAMPLING.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                    samplingMode: 'top_k',
                    samplingK: 10,
                })}
            </>,
        );
        const label = screen.getByTestId('scene-16-mode-label');
        expect(label.textContent).toMatch(/Top-K/i);
        expect(label.textContent).toMatch(/k = 10/);
    });

    it('renders fill line in top_p mode (and only top_p mode)', () => {
        const { rerender } = render(
            <>
                {SCENE_SAMPLING.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                    samplingMode: 'top_p',
                    samplingP: 0.9,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-16-fill-line')).toBeInTheDocument();

        rerender(
            <>
                {SCENE_SAMPLING.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                    samplingMode: 'greedy',
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-16-fill-line')).not.toBeInTheDocument();
    });

    it('dart is always present', () => {
        render(
            <>
                {SCENE_SAMPLING.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-16-dart')).toBeInTheDocument();
    });

    it('winning-token flash appears at t=1', () => {
        render(
            <>
                {SCENE_SAMPLING.render(1, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-16-winning-string')).toBeInTheDocument();
    });

    it('winning-token flash hidden during narrow phase', () => {
        render(
            <>
                {SCENE_SAMPLING.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-16-winning-string')).not.toBeInTheDocument();
    });

    it('transform populates sampledToken with greedy = bar #1', () => {
        const out = SCENE_SAMPLING.transform({
            tokens: SAMPLE_TOKENS,
            logits: SAMPLE_LOGITS,
            samplingMode: 'greedy',
        });
        expect(out.sampledToken).toBeDefined();
        expect(out.sampledToken!.prob).toBeGreaterThan(0);
    });

    it('transform is idempotent (sampledToken once set is sticky)', () => {
        const first = SCENE_SAMPLING.transform({
            tokens: SAMPLE_TOKENS,
            logits: SAMPLE_LOGITS,
        });
        const second = SCENE_SAMPLING.transform(first);
        expect(second).toBe(first);
    });
});

describe('Scene 17 — token emerges', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_TOKEN_EMERGE.id).toBe('token-emerge');
        expect(SCENE_TOKEN_EMERGE.durationMs).toBe(500);
    });

    it('renders caption + generated-so-far tray', () => {
        render(
            <>
                {SCENE_TOKEN_EMERGE.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                    sampledToken: {
                        vocabIndex: 7,
                        string: ' hello',
                        prob: 0.7,
                    },
                })}
            </>,
        );
        expect(screen.getByTestId('scene-17-caption')).toBeInTheDocument();
        expect(screen.getByTestId('scene-17-tray')).toBeInTheDocument();
    });

    it('renders flying token in early phase (t=0.2)', () => {
        render(
            <>
                {SCENE_TOKEN_EMERGE.render(0.2, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                    sampledToken: {
                        vocabIndex: 7,
                        string: ' hello',
                        prob: 0.7,
                    },
                })}
            </>,
        );
        expect(screen.getByTestId('scene-17-flying-token')).toBeInTheDocument();
    });

    it('renders new token in tray after t=0.4', () => {
        render(
            <>
                {SCENE_TOKEN_EMERGE.render(1, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                    sampledToken: {
                        vocabIndex: 7,
                        string: ' hello',
                        prob: 0.7,
                    },
                })}
            </>,
        );
        expect(screen.getByTestId('scene-17-new-token')).toBeInTheDocument();
    });

    it('renders prior generated tokens', () => {
        const { container } = render(
            <>
                {SCENE_TOKEN_EMERGE.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    logits: SAMPLE_LOGITS,
                    sampledToken: {
                        vocabIndex: 99,
                        string: ' world',
                        prob: 0.3,
                    },
                    generatedTokens: [
                        { vocabIndex: 7, string: ' hello' },
                        { vocabIndex: 8, string: ',' },
                    ],
                })}
            </>,
        );
        // Three tokens total: 2 prior + 1 new
        expect(container.textContent).toMatch(/hello/);
        expect(container.textContent).toMatch(/world/);
    });

    it('transform appends sampledToken to generatedTokens', () => {
        const out = SCENE_TOKEN_EMERGE.transform({
            tokens: SAMPLE_TOKENS,
            logits: SAMPLE_LOGITS,
            sampledToken: {
                vocabIndex: 42,
                string: ' yes',
                prob: 0.8,
            },
            generatedTokens: [],
        });
        expect(out.generatedTokens).toHaveLength(1);
        expect(out.generatedTokens![0].vocabIndex).toBe(42);
        expect(out.generatedTokens![0].string).toBe(' yes');
    });

    it('transform is idempotent (does not double-append on repeated calls)', () => {
        const first = SCENE_TOKEN_EMERGE.transform({
            tokens: SAMPLE_TOKENS,
            logits: SAMPLE_LOGITS,
            sampledToken: {
                vocabIndex: 42,
                string: ' yes',
                prob: 0.8,
            },
            generatedTokens: [],
        });
        const second = SCENE_TOKEN_EMERGE.transform(first);
        expect(second.generatedTokens).toHaveLength(1);
    });

    it('transform synthesizes a winner when sampledToken is absent', () => {
        const out = SCENE_TOKEN_EMERGE.transform({
            tokens: SAMPLE_TOKENS,
            logits: SAMPLE_LOGITS,
        });
        expect(out.generatedTokens).toBeDefined();
        expect(out.generatedTokens!.length).toBe(1);
        expect(out.sampledToken).toBeDefined();
    });
});
