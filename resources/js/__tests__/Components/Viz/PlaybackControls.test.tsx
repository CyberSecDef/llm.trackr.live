import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlaybackControls from '@/Components/Viz/PlaybackControls';
import type { SceneRunnerControls, SceneRunnerState } from '@/Components/Viz/useSceneRunner';

function makeState(overrides: Partial<SceneRunnerState> = {}): SceneRunnerState {
    return {
        sceneIndex: 5,
        sceneId: 'embedding-lookup',
        t: 0.3,
        playing: false,
        speed: 1,
        totalScenes: 21,
        pipelineState: {},
        currentScene: undefined,
        ...overrides,
    };
}

function makeControls(): SceneRunnerControls {
    return {
        play: vi.fn(),
        pause: vi.fn(),
        toggle: vi.fn(),
        setScene: vi.fn(),
        nextScene: vi.fn(),
        prevScene: vi.fn(),
        setT: vi.fn(),
        setSpeed: vi.fn(),
    };
}

describe('<PlaybackControls />', () => {
    it('renders all four control groups', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState()} controls={controls} />);
        expect(screen.getByTestId('viz-playback-toggle')).toBeInTheDocument();
        expect(screen.getByTestId('viz-playback-step-group')).toBeInTheDocument();
        expect(screen.getByTestId('viz-playback-speed-group')).toBeInTheDocument();
        expect(screen.getByTestId('viz-playback-jump-live')).toBeInTheDocument();
    });

    it('toggle button label switches with playing state', () => {
        const controls = makeControls();
        const { rerender } = render(
            <PlaybackControls state={makeState({ playing: false })} controls={controls} />,
        );
        expect(screen.getByTestId('viz-playback-toggle').textContent).toBe('Play');

        rerender(<PlaybackControls state={makeState({ playing: true })} controls={controls} />);
        expect(screen.getByTestId('viz-playback-toggle').textContent).toBe('Pause');
    });

    it('toggle button calls controls.toggle', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState()} controls={controls} />);
        fireEvent.click(screen.getByTestId('viz-playback-toggle'));
        expect(controls.toggle).toHaveBeenCalledOnce();
    });

    it('prev button calls controls.prevScene', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState()} controls={controls} />);
        fireEvent.click(screen.getByTestId('viz-playback-prev'));
        expect(controls.prevScene).toHaveBeenCalledOnce();
    });

    it('next button calls controls.nextScene', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState()} controls={controls} />);
        fireEvent.click(screen.getByTestId('viz-playback-next'));
        expect(controls.nextScene).toHaveBeenCalledOnce();
    });

    it('prev button is disabled at sceneIndex=0', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState({ sceneIndex: 0 })} controls={controls} />);
        const prev = screen.getByTestId('viz-playback-prev');
        expect(prev).toBeDisabled();
        fireEvent.click(prev);
        expect(controls.prevScene).not.toHaveBeenCalled();
    });

    it('next button is disabled at sceneIndex=totalScenes-1', () => {
        const controls = makeControls();
        render(
            <PlaybackControls
                state={makeState({ sceneIndex: 20, totalScenes: 21 })}
                controls={controls}
            />,
        );
        const next = screen.getByTestId('viz-playback-next');
        expect(next).toBeDisabled();
    });

    it('renders all three speed buttons with the active one aria-checked', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState({ speed: 1 })} controls={controls} />);
        const s025 = screen.getByTestId('viz-playback-speed-0.25');
        const s1 = screen.getByTestId('viz-playback-speed-1');
        const s4 = screen.getByTestId('viz-playback-speed-4');
        expect(s025.getAttribute('aria-checked')).toBe('false');
        expect(s1.getAttribute('aria-checked')).toBe('true');
        expect(s4.getAttribute('aria-checked')).toBe('false');
    });

    it('clicking a speed button calls controls.setSpeed', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState({ speed: 1 })} controls={controls} />);
        fireEvent.click(screen.getByTestId('viz-playback-speed-4'));
        expect(controls.setSpeed).toHaveBeenCalledWith(4);
    });

    it('jump-to-live is disabled when liveSceneIndex is null', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState()} controls={controls} />);
        const jump = screen.getByTestId('viz-playback-jump-live');
        expect(jump).toBeDisabled();
        fireEvent.click(jump);
        expect(controls.setScene).not.toHaveBeenCalled();
    });

    it('jump-to-live calls setScene with the live index when enabled', () => {
        const controls = makeControls();
        render(
            <PlaybackControls
                state={makeState({ sceneIndex: 5 })}
                controls={controls}
                liveSceneIndex={18}
            />,
        );
        const jump = screen.getByTestId('viz-playback-jump-live');
        expect(jump).not.toBeDisabled();
        fireEvent.click(jump);
        expect(controls.setScene).toHaveBeenCalledWith(18);
    });

    it('jump-to-live is disabled when already at the live scene', () => {
        const controls = makeControls();
        render(
            <PlaybackControls
                state={makeState({ sceneIndex: 18 })}
                controls={controls}
                liveSceneIndex={18}
            />,
        );
        const jump = screen.getByTestId('viz-playback-jump-live');
        expect(jump).toBeDisabled();
    });

    it('scene-position label reads "Scene N / M · t = X.XX"', () => {
        const controls = makeControls();
        render(
            <PlaybackControls
                state={makeState({ sceneIndex: 5, totalScenes: 21, t: 0.42 })}
                controls={controls}
            />,
        );
        const label = screen.getByTestId('viz-playback-scene-label');
        expect(label.textContent).toContain('Scene 5 / 20');
        expect(label.textContent).toContain('t = 0.42');
    });

    it('exposes role="toolbar" with aria-label', () => {
        const controls = makeControls();
        render(<PlaybackControls state={makeState()} controls={controls} />);
        const root = screen.getByTestId('viz-playback-controls');
        expect(root.getAttribute('role')).toBe('toolbar');
        expect(root.getAttribute('aria-label')).toBe('Playback controls');
    });
});
