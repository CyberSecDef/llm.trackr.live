import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VectorStrip from '@/Components/Viz/VectorStrip';
import ParticleTrail from '@/Components/Viz/ParticleTrail';
import { SCENE_ATTENTION } from '@/Components/Viz/scenes';
import { PerformanceModeProvider } from '@/Components/Viz/PerformanceModeContext';
import { syntheticEmbedding, layerNormalize } from '@/lib/syntheticEmbedding';
import type { BpeToken } from '@/lib/tokenizer';

const fullMode = { fps: 60, degraded: false };
const degradedMode = { fps: 12, degraded: true };

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

describe('Performance degradation — VectorStrip', () => {
    it('renders 128 cells in full mode', () => {
        const values = Array.from({ length: 256 }, (_, i) => i / 256);
        render(
            <PerformanceModeProvider value={fullMode}>
                <VectorStrip values={values} visibleCells={128} />
            </PerformanceModeProvider>,
        );
        const cells = screen.getAllByTestId(/^vector-strip-cell-\d+$/);
        expect(cells.length).toBe(128);
    });

    it('clamps to 64 cells in degraded mode', () => {
        const values = Array.from({ length: 256 }, (_, i) => i / 256);
        render(
            <PerformanceModeProvider value={degradedMode}>
                <VectorStrip values={values} visibleCells={128} />
            </PerformanceModeProvider>,
        );
        const cells = screen.getAllByTestId(/^vector-strip-cell-\d+$/);
        expect(cells.length).toBe(64);
    });

    it('does NOT expand cells beyond original visibleCells in degraded mode', () => {
        const values = Array.from({ length: 256 }, (_, i) => i / 256);
        // Caller asked for 32; degraded shouldn't blow that up to 64.
        render(
            <PerformanceModeProvider value={degradedMode}>
                <VectorStrip values={values} visibleCells={32} />
            </PerformanceModeProvider>,
        );
        const cells = screen.getAllByTestId(/^vector-strip-cell-\d+$/);
        expect(cells.length).toBe(32);
    });
});

describe('Performance degradation — ParticleTrail', () => {
    it('animates in full mode (motion-safe class present)', () => {
        render(
            <PerformanceModeProvider value={fullMode}>
                <ParticleTrail from={{ x: 0, y: 0 }} to={{ x: 50, y: 50 }} width={60} height={60} />
            </PerformanceModeProvider>,
        );
        const pulse = screen.getByTestId('particle-trail-pulse');
        expect(pulse.getAttribute('class')).toMatch(/motion-safe:/);
        expect(pulse.getAttribute('data-degraded')).toBe('false');
    });

    it('skips animation in degraded mode', () => {
        render(
            <PerformanceModeProvider value={degradedMode}>
                <ParticleTrail from={{ x: 0, y: 0 }} to={{ x: 50, y: 50 }} width={60} height={60} />
            </PerformanceModeProvider>,
        );
        const pulse = screen.getByTestId('particle-trail-pulse');
        expect(pulse.getAttribute('data-degraded')).toBe('true');
        // No animation class in degraded mode.
        expect(pulse.getAttribute('class') ?? '').not.toMatch(/motion-safe:/);
    });
});

describe('Performance degradation — Scene 8 multi-head fan', () => {
    const SAMPLE_TOKENS = [tok(1, 'a'), tok(2, 'b'), tok(3, 'c')];
    const SAMPLE_VECTORS = SAMPLE_TOKENS.map((t) => layerNormalize(syntheticEmbedding(t.id, 128)));

    it('renders 6 representative heads in full mode', () => {
        render(
            <PerformanceModeProvider value={fullMode}>
                {SCENE_ATTENTION.render(0.45, {
                    tokens: SAMPLE_TOKENS,
                    layerNormed: SAMPLE_VECTORS,
                })}
            </PerformanceModeProvider>,
        );
        const heads = screen.getAllByTestId(/^scene-8b-head-\d+$/);
        expect(heads.length).toBe(6);
    });

    it('collapses to 1 head in degraded mode', () => {
        render(
            <PerformanceModeProvider value={degradedMode}>
                {SCENE_ATTENTION.render(0.45, {
                    tokens: SAMPLE_TOKENS,
                    layerNormed: SAMPLE_VECTORS,
                })}
            </PerformanceModeProvider>,
        );
        const heads = screen.getAllByTestId(/^scene-8b-head-\d+$/);
        expect(heads.length).toBe(1);
    });

    it('caption appends " · degraded" in degraded mode', () => {
        render(
            <PerformanceModeProvider value={degradedMode}>
                {SCENE_ATTENTION.render(0.45, {
                    tokens: SAMPLE_TOKENS,
                    layerNormed: SAMPLE_VECTORS,
                })}
            </PerformanceModeProvider>,
        );
        const caption = screen.getByTestId('scene-8b-head-caption');
        expect(caption.textContent).toMatch(/degraded/);
    });

    it('caption omits "degraded" in full mode', () => {
        render(
            <PerformanceModeProvider value={fullMode}>
                {SCENE_ATTENTION.render(0.45, {
                    tokens: SAMPLE_TOKENS,
                    layerNormed: SAMPLE_VECTORS,
                })}
            </PerformanceModeProvider>,
        );
        const caption = screen.getByTestId('scene-8b-head-caption');
        expect(caption.textContent).not.toMatch(/degraded/);
    });
});
