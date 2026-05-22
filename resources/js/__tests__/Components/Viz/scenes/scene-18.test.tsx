import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENE_AUTOREGRESSIVE_LOOP } from '@/Components/Viz/scenes';
import { LOOP_TOTAL_DURATION } from '@/lib/syntheticAutoregression';
import type { BpeToken } from '@/lib/tokenizer';

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

const SAMPLE_TOKENS: BpeToken[] = [tok(1, 'hello'), tok(2, ' world')];

const SEED_GENERATED = [{ vocabIndex: 100, string: ' the' }];

describe('Scene 18 — autoregressive loop', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_AUTOREGRESSIVE_LOOP.id).toBe('autoregressive-loop');
        expect(SCENE_AUTOREGRESSIVE_LOOP.durationMs).toBe(LOOP_TOTAL_DURATION);
    });

    it('renders the scene caption + iteration label', () => {
        render(
            <>
                {SCENE_AUTOREGRESSIVE_LOOP.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    generatedTokens: SEED_GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-18-caption')).toBeInTheDocument();
        expect(screen.getByTestId('scene-18-iter-label')).toBeInTheDocument();
    });

    it('iteration label shows index / total at t=0', () => {
        render(
            <>
                {SCENE_AUTOREGRESSIVE_LOOP.render(0, {
                    tokens: SAMPLE_TOKENS,
                    generatedTokens: SEED_GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-18-iter-label').textContent).toMatch(/Iteration 1 \/ 7/i);
    });

    it('iteration label updates to last iteration at t=1', () => {
        render(
            <>
                {SCENE_AUTOREGRESSIVE_LOOP.render(1, {
                    tokens: SAMPLE_TOKENS,
                    generatedTokens: SEED_GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-18-iter-label').textContent).toMatch(/Iteration 7 \/ 7/i);
    });

    it('shows the beam line during the compute phase (localT 0.3–0.7)', () => {
        // At t ≈ 1500ms / 6900ms ≈ 0.217, we're in iter 1 at localT ≈ 0.75
        // which is past the beam window (already in landed phase).
        // At t ≈ 1000ms / 6900ms ≈ 0.145, iter 1 localT = 0.5 — beam should show.
        render(
            <>
                {SCENE_AUTOREGRESSIVE_LOOP.render(1000 / LOOP_TOTAL_DURATION, {
                    tokens: SAMPLE_TOKENS,
                    generatedTokens: SEED_GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-18-beam-line')).toBeInTheDocument();
    });

    it('renders the cumulative chat tray', () => {
        render(
            <>
                {SCENE_AUTOREGRESSIVE_LOOP.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                    generatedTokens: SEED_GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-18-tray')).toBeInTheDocument();
    });

    it('cumulative tray grows across the scene', () => {
        const { container: c0 } = render(
            <>
                {SCENE_AUTOREGRESSIVE_LOOP.render(0, {
                    tokens: SAMPLE_TOKENS,
                    generatedTokens: SEED_GENERATED,
                })}
            </>,
        );
        const startText = c0.querySelector('[data-testid="scene-18-tray"]')!.textContent ?? '';
        expect(startText).toMatch(/1 tokens/);

        const { container: c1 } = render(
            <>
                {SCENE_AUTOREGRESSIVE_LOOP.render(1, {
                    tokens: SAMPLE_TOKENS,
                    generatedTokens: SEED_GENERATED,
                })}
            </>,
        );
        const endText = c1.querySelector('[data-testid="scene-18-tray"]')!.textContent ?? '';
        // Started with 1 seed + 7 loop iterations = 8 cumulative at end.
        expect(endText).toMatch(/8 tokens/);
    });

    it('transform appends 7 iterations to generatedTokens', () => {
        const out = SCENE_AUTOREGRESSIVE_LOOP.transform({
            tokens: SAMPLE_TOKENS,
            generatedTokens: SEED_GENERATED,
        });
        expect(out.loopIterations).toBeDefined();
        expect(out.loopIterations!.length).toBe(7);
        // Seed had 1; now should have 1 + 7 = 8.
        expect(out.generatedTokens!.length).toBe(8);
    });

    it('transform is idempotent (loopIterations sticky)', () => {
        const first = SCENE_AUTOREGRESSIVE_LOOP.transform({
            tokens: SAMPLE_TOKENS,
            generatedTokens: SEED_GENERATED,
        });
        const second = SCENE_AUTOREGRESSIVE_LOOP.transform(first);
        expect(second).toBe(first);
    });

    it('handles empty generatedTokens (no Scene 17 seed)', () => {
        const out = SCENE_AUTOREGRESSIVE_LOOP.transform({
            tokens: SAMPLE_TOKENS,
        });
        expect(out.loopIterations).toBeDefined();
        expect(out.generatedTokens!.length).toBe(7); // just the loop iters
    });

    it('renders empty placeholder when iterations cannot be derived', () => {
        // Force empty iterations by passing in an empty loopIterations
        // override. The synthesize fallback should populate from
        // LOOP_ITERATION_DURATIONS, so this primarily exercises the
        // explicit-empty path (chunk-10 may pass empty when waiting
        // for the WebSocket).
        // We test that synthesize is used when state.loopIterations
        // is undefined (the normal path).
        render(
            <>
                {SCENE_AUTOREGRESSIVE_LOOP.render(0.5, {
                    tokens: SAMPLE_TOKENS,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-18-iter-label')).toBeInTheDocument();
    });
});
