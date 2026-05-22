import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENE_DETOKENIZE, SCENE_KV_CACHE } from '@/Components/Viz/scenes';

const GENERATED = [
    { vocabIndex: 100, string: ' the' },
    { vocabIndex: 250, string: ' quick' },
    { vocabIndex: 410, string: ' brown' },
    { vocabIndex: 720, string: ' fox' },
];

describe('Scene 19 — KV cache', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_KV_CACHE.id).toBe('kv-cache');
        expect(SCENE_KV_CACHE.durationMs).toBe(2000);
    });

    it('renders caption + lock icon + cache drawer', () => {
        render(
            <>
                {SCENE_KV_CACHE.render(0.5, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-19-caption')).toBeInTheDocument();
        expect(screen.getByTestId('scene-19-lock-icon')).toBeInTheDocument();
        expect(screen.getByTestId('scene-19-drawer')).toBeInTheDocument();
    });

    it('renders both K and V matrices', () => {
        render(
            <>
                {SCENE_KV_CACHE.render(0.6, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-19-k-matrix')).toBeInTheDocument();
        expect(screen.getByTestId('scene-19-v-matrix')).toBeInTheDocument();
    });

    it('drawer translates in across the early phase', () => {
        // At t=0 the drawer should be translated off-screen.
        const { container: c0 } = render(
            <>
                {SCENE_KV_CACHE.render(0, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        const drawer0 = c0.querySelector('[data-testid="scene-19-drawer"]') as HTMLElement;
        expect(drawer0.style.transform).toMatch(/translateX\(100px\)/);

        // At t=0.5 (past reveal) it should be fully open.
        const { container: c1 } = render(
            <>
                {SCENE_KV_CACHE.render(0.5, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        const drawer1 = c1.querySelector('[data-testid="scene-19-drawer"]') as HTMLElement;
        expect(drawer1.style.transform).toMatch(/translateX\(0px\)/);
    });

    it('new-row markers appear in the final phase', () => {
        render(
            <>
                {SCENE_KV_CACHE.render(1, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-19-k-matrix-new-row-marker')).toBeInTheDocument();
        expect(screen.getByTestId('scene-19-v-matrix-new-row-marker')).toBeInTheDocument();
    });

    it('new-row markers absent before the pulse phase', () => {
        render(
            <>
                {SCENE_KV_CACHE.render(0.4, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-19-k-matrix-new-row-marker')).not.toBeInTheDocument();
    });

    it('transform is identity', () => {
        const input = { generatedTokens: GENERATED };
        expect(SCENE_KV_CACHE.transform(input)).toBe(input);
    });

    it('handles empty generatedTokens', () => {
        render(
            <>
                {SCENE_KV_CACHE.render(0.5, {
                    generatedTokens: [],
                })}
            </>,
        );
        expect(screen.getByTestId('scene-19-k-matrix')).toBeInTheDocument();
    });
});

describe('Scene 20 — detokenization + EOS flourish', () => {
    it('exposes id, durationMs, render, transform', () => {
        expect(SCENE_DETOKENIZE.id).toBe('detokenize');
        expect(SCENE_DETOKENIZE.durationMs).toBe(3000);
    });

    it('renders caption + chat bubble at any t', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.5, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-20-caption')).toBeInTheDocument();
        expect(screen.getByTestId('scene-20-chat-bubble')).toBeInTheDocument();
    });

    it('chat bubble shows the token count', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.5, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-20-chat-bubble').textContent).toMatch(/4 tokens emitted/);
    });

    it('lookup widget visible during reveal phase (t=0.3)', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.3, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-20-lookup-widget')).toBeInTheDocument();
        expect(screen.getByTestId('scene-20-vocab-index')).toBeInTheDocument();
        expect(screen.getByTestId('scene-20-string-result')).toBeInTheDocument();
    });

    it('lookup widget hidden after the reveal phase (t=0.85)', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.85, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-20-lookup-widget')).not.toBeInTheDocument();
    });

    it('EOS badge appears in the transition phase (t=0.85)', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.85, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-20-eos-badge')).toBeInTheDocument();
    });

    it('EOS badge hidden before the transition phase (t=0.4)', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.4, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-20-eos-badge')).not.toBeInTheDocument();
    });

    it('completion flourish renders at t=1', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(1, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-20-flourish')).toBeInTheDocument();
        expect(screen.getByTestId('scene-20-flourish').textContent).toMatch(/Inference complete/i);
    });

    it('completion flourish hidden in the reveal phase', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.5, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.queryByTestId('scene-20-flourish')).not.toBeInTheDocument();
    });

    it('caption swaps to "complete" during the flourish', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.95, {
                    generatedTokens: GENERATED,
                })}
            </>,
        );
        expect(screen.getByTestId('scene-20-caption').textContent).toMatch(/complete/i);
    });

    it('renders chat-token pills, capped at 8', () => {
        const many = Array.from({ length: 14 }, (_, i) => ({
            vocabIndex: i * 100,
            string: ` t${i}`,
        }));
        render(
            <>
                {SCENE_DETOKENIZE.render(0.5, {
                    generatedTokens: many,
                })}
            </>,
        );
        const pills = screen.getAllByTestId(/^scene-20-chat-token-\d+$/);
        expect(pills.length).toBe(8);
    });

    it('transform is identity', () => {
        const input = { generatedTokens: GENERATED };
        expect(SCENE_DETOKENIZE.transform(input)).toBe(input);
    });

    it('handles empty generatedTokens (no flying tokens)', () => {
        render(
            <>
                {SCENE_DETOKENIZE.render(0.5, {
                    generatedTokens: [],
                })}
            </>,
        );
        expect(screen.getByTestId('scene-20-chat-bubble')).toBeInTheDocument();
    });
});
