import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CinematicViz from '@/Components/Viz/CinematicViz';
import type { PipelineState, Scene } from '@/Components/Viz/Scene';

describe('<CinematicViz />', () => {
    it('shows the idle screen when no prompt has been submitted', () => {
        render(<CinematicViz events={[]} prompt={null} />);
        expect(screen.getByTestId('cinematic-viz-idle')).toBeInTheDocument();
        expect(screen.queryByTestId('cinematic-viz-canvas')).not.toBeInTheDocument();
    });

    it('shows the canvas (not idle) when a prompt is present, even with no scenes registered', () => {
        render(<CinematicViz events={[]} prompt="hello" />);
        expect(screen.queryByTestId('cinematic-viz-idle')).not.toBeInTheDocument();
        expect(screen.getByTestId('cinematic-viz-canvas')).toBeInTheDocument();
    });

    it('mounts the active scene render output when a scene is registered', () => {
        const fakeScene: Scene<PipelineState, PipelineState> = {
            id: 'prompt-entry',
            durationMs: 500,
            render: (_t, input) => (
                <div data-testid="fake-scene-render">
                    Got prompt: {input.promptText ?? '(none)'}
                </div>
            ),
            transform: (input) => input,
        };

        render(<CinematicViz events={[]} prompt="hello world" scenes={[fakeScene]} />);

        expect(screen.getByTestId('fake-scene-render')).toBeInTheDocument();
        expect(screen.getByTestId('fake-scene-render').textContent).toContain(
            'Got prompt: hello world',
        );
    });

    it('seeds PipelineState.promptText from the prompt prop', () => {
        const captured: PipelineState[] = [];
        const captureScene: Scene<PipelineState, PipelineState> = {
            id: 'prompt-entry',
            durationMs: 500,
            render: (_t, input) => {
                captured.push(input);
                return null;
            },
            transform: (input) => input,
        };

        render(<CinematicViz events={[]} prompt="the quick brown fox" scenes={[captureScene]} />);

        expect(captured.length).toBeGreaterThan(0);
        expect(captured[0].promptText).toBe('the quick brown fox');
    });

    it('always renders the pipeline progress bar', () => {
        render(<CinematicViz events={[]} prompt={null} />);
        expect(screen.getByTestId('viz-pipeline-progress')).toBeInTheDocument();
    });

    it('always renders the persistent UI placeholders', () => {
        render(<CinematicViz events={[]} prompt={null} />);
        expect(screen.getByTestId('viz-vocab-sidebar')).toBeInTheDocument();
        expect(screen.getByTestId('viz-chat-bubble')).toBeInTheDocument();
        expect(screen.getByTestId('viz-layer-counter')).toBeInTheDocument();
    });
});
