import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENE_LAYER_STACK } from '@/Components/Viz/scenes';
import { syntheticEmbedding, layerNormalize } from '@/lib/syntheticEmbedding';
import type { BpeToken } from '@/lib/tokenizer';

const renderScene = (t: number, state: Parameters<typeof SCENE_LAYER_STACK.render>[1]) =>
    render(<>{SCENE_LAYER_STACK.render(t, state)}</>);

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

const SAMPLE_TOKENS: BpeToken[] = [tok(1, 'hello'), tok(2, ' '), tok(3, 'world'), tok(4, '!')];

const SAMPLE_VECTORS = SAMPLE_TOKENS.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));

describe('Scene 12 — layer-stack tower', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_LAYER_STACK.id).toBe('layer-stack');
        expect(SCENE_LAYER_STACK.durationMs).toBe(10000);
        expect(typeof SCENE_LAYER_STACK.render).toBe('function');
        expect(typeof SCENE_LAYER_STACK.transform).toBe('function');
    });

    it('renders the scene caption + counter at any t', () => {
        renderScene(0.5, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        expect(screen.getByTestId('scene-12-caption')).toBeInTheDocument();
        expect(screen.getByTestId('scene-12-counter')).toBeInTheDocument();
    });

    it('shows "Layer 01 / 32" at t=0 (zero-padded)', () => {
        renderScene(0, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        const counter = screen.getByTestId('scene-12-counter-value');
        expect(counter.textContent).toBe('01 / 32');
    });

    it('shows "Layer 32 / 32" at t=1', () => {
        renderScene(1, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        const counter = screen.getByTestId('scene-12-counter-value');
        expect(counter.textContent).toBe('32 / 32');
    });

    it('uses totalLayers from state', () => {
        renderScene(1, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 80,
        });
        const counter = screen.getByTestId('scene-12-counter-value');
        expect(counter.textContent).toBe('80 / 80');
    });

    it('defaults to 32 layers when totalLayers is missing', () => {
        renderScene(1, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
        });
        const counter = screen.getByTestId('scene-12-counter-value');
        expect(counter.textContent).toBe('32 / 32');
    });

    it('renders progress bar reflecting packet position', () => {
        renderScene(1, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        const bar = screen.getByTestId('scene-12-progress-bar');
        // At t=1 the bar should be at 100% width.
        expect((bar as HTMLElement).style.width).toBe('100%');
    });

    it('renders motion-blur streak only during blur phase', () => {
        const { rerender } = renderScene(0.05, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        expect(screen.queryByTestId('scene-12-blur-streak')).not.toBeInTheDocument();

        rerender(
            <>
                {SCENE_LAYER_STACK.render(0.35, {
                    tokens: SAMPLE_TOKENS,
                    residualOutput2: SAMPLE_VECTORS,
                    totalLayers: 32,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-12-blur-streak')).toBeInTheDocument();
    });

    it('mounts the final-layer detail panel only during rezoom phase', () => {
        renderScene(0.5, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        expect(screen.queryByTestId('scene-12-final-detail')).not.toBeInTheDocument();
    });

    it('shows the final-layer detail panel at t=0.95', () => {
        renderScene(0.95, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        expect(screen.getByTestId('scene-12-final-detail')).toBeInTheDocument();
        const rows = screen.getAllByTestId(/scene-12-final-row-/);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThanOrEqual(4);
    });

    it('exposes packet group + tower aria label', () => {
        renderScene(0.5, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        expect(screen.getByTestId('scene-12-packet')).toBeInTheDocument();
        const tower = screen.getByTestId('scene-12-tower');
        expect(tower.getAttribute('aria-label')).toMatch(/Tower of 32 transformer layers/i);
    });

    it('falls back through residualOutput → ffnOutput → … when residualOutput2 missing', () => {
        renderScene(0.95, {
            tokens: SAMPLE_TOKENS,
            embeddings: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        // Final-layer detail still renders something.
        const rows = screen.getAllByTestId(/scene-12-final-row-/);
        expect(rows.length).toBeGreaterThan(0);
    });

    it('transform() is identity (camera-only scene)', () => {
        const input = {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        };
        expect(SCENE_LAYER_STACK.transform(input)).toBe(input);
    });

    it('renders phase label in the HUD', () => {
        const { container } = renderScene(0.35, {
            tokens: SAMPLE_TOKENS,
            residualOutput2: SAMPLE_VECTORS,
            totalLayers: 32,
        });
        expect(container.textContent).toMatch(/Phase: blur/i);
    });
});
