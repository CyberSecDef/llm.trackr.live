import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CinematicViz from '@/Components/Viz/CinematicViz';
import type { PipelineState, Scene } from '@/Components/Viz/Scene';

/*
 * Tests for the M13 chunk-13 tri-state gate notices:
 *   - full mode (no gate notice)
 *   - reduced-motion (PowerPoint mode + 4s auto-advance)
 *   - WebGL 2 unavailable (informational notice; viz still renders)
 *
 * Hook mocks are scoped per-suite via vi.mock so other CinematicViz
 * tests (which default to webgl=true / reduced=false) stay unaffected.
 */

const tCaptureScene: Scene<PipelineState, PipelineState> = {
    id: 'prompt-entry',
    durationMs: 500,
    render: (t, input) => (
        <div data-testid="captured-render" data-t={t.toFixed(3)}>
            Got prompt: {input.promptText ?? '(none)'}
        </div>
    ),
    transform: (input) => input,
};

describe('<CinematicViz /> chunk-13 gates — defaults', () => {
    it('renders no gate notice when both gates pass', () => {
        render(<CinematicViz events={[]} prompt="hello" />);
        expect(screen.queryByTestId('cinematic-viz-gate-notice')).not.toBeInTheDocument();
    });
});

describe('<CinematicViz /> chunk-13 gates — reduced-motion', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.doMock('@/hooks/useReducedMotion', () => ({
            useReducedMotion: () => true,
        }));
    });

    afterEach(() => {
        vi.doUnmock('@/hooks/useReducedMotion');
        vi.resetModules();
    });

    it('shows the reduced-motion notice with the chunk-13 copy', async () => {
        const { default: CinematicVizReloaded } = await import('@/Components/Viz/CinematicViz');
        render(<CinematicVizReloaded events={[]} prompt="hello" />);
        const notice = screen.getByTestId('cinematic-viz-gate-notice');
        expect(notice.getAttribute('data-gate-mode')).toBe('reduced-motion');
        expect(notice.textContent).toMatch(/Reduced-motion is set/i);
        expect(notice.textContent).toMatch(/static completion frames/i);
        expect(notice.textContent).toMatch(/advance via Step or wait 4 seconds/i);
    });

    it('renders the scene at t=1 (completion frame)', async () => {
        const { default: CinematicVizReloaded } = await import('@/Components/Viz/CinematicViz');
        render(<CinematicVizReloaded events={[]} prompt="hello" scenes={[tCaptureScene]} />);
        const rendered = screen.getByTestId('captured-render');
        expect(rendered.getAttribute('data-t')).toBe('1.000');
    });

    it('canvas carries data-reduced-motion="true"', async () => {
        const { default: CinematicVizReloaded } = await import('@/Components/Viz/CinematicViz');
        render(<CinematicVizReloaded events={[]} prompt="hello" scenes={[tCaptureScene]} />);
        const canvas = screen.getByTestId('cinematic-viz-canvas');
        expect(canvas.getAttribute('data-reduced-motion')).toBe('true');
    });
});

describe('<CinematicViz /> chunk-13 gates — WebGL 2 unavailable', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.doMock('@/hooks/useWebGL2Support', () => ({
            useWebGL2Support: () => false,
        }));
    });

    afterEach(() => {
        vi.doUnmock('@/hooks/useWebGL2Support');
        vi.resetModules();
    });

    it('shows the WebGL-unsupported notice with the chunk-13 spec copy', async () => {
        const { default: CinematicVizReloaded } = await import('@/Components/Viz/CinematicViz');
        render(<CinematicVizReloaded events={[]} prompt="hello" />);
        const notice = screen.getByTestId('cinematic-viz-gate-notice');
        expect(notice.getAttribute('data-gate-mode')).toBe('webgl');
        expect(notice.textContent).toMatch(/3D camera moves are unavailable/i);
        expect(notice.textContent).toMatch(/rendering in 2D mode/i);
    });

    it('viz still renders (does NOT block like the M12 binary disable)', async () => {
        const { default: CinematicVizReloaded } = await import('@/Components/Viz/CinematicViz');
        render(<CinematicVizReloaded events={[]} prompt="hello" scenes={[tCaptureScene]} />);
        expect(screen.getByTestId('captured-render')).toBeInTheDocument();
    });

    it('canvas carries data-reduced-motion="false" (WebGL gate alone does not freeze t)', async () => {
        const { default: CinematicVizReloaded } = await import('@/Components/Viz/CinematicViz');
        render(<CinematicVizReloaded events={[]} prompt="hello" scenes={[tCaptureScene]} />);
        const canvas = screen.getByTestId('cinematic-viz-canvas');
        expect(canvas.getAttribute('data-reduced-motion')).toBe('false');
    });
});

describe('<CinematicViz /> chunk-13 gates — both gates active', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.doMock('@/hooks/useReducedMotion', () => ({
            useReducedMotion: () => true,
        }));
        vi.doMock('@/hooks/useWebGL2Support', () => ({
            useWebGL2Support: () => false,
        }));
    });

    afterEach(() => {
        vi.doUnmock('@/hooks/useReducedMotion');
        vi.doUnmock('@/hooks/useWebGL2Support');
        vi.resetModules();
    });

    it('WebGL notice takes precedence over the reduced-motion notice', async () => {
        const { default: CinematicVizReloaded } = await import('@/Components/Viz/CinematicViz');
        render(<CinematicVizReloaded events={[]} prompt="hello" />);
        const notice = screen.getByTestId('cinematic-viz-gate-notice');
        expect(notice.getAttribute('data-gate-mode')).toBe('webgl');
    });

    it('reduced-motion behavior (t=1 pin) still applies regardless of which notice shows', async () => {
        const { default: CinematicVizReloaded } = await import('@/Components/Viz/CinematicViz');
        render(<CinematicVizReloaded events={[]} prompt="hello" scenes={[tCaptureScene]} />);
        const rendered = screen.getByTestId('captured-render');
        expect(rendered.getAttribute('data-t')).toBe('1.000');
    });
});
