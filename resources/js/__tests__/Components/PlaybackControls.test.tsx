import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlaybackControls from '@/Components/PlaybackControls';

const defaultProps = {
    playing: true,
    speed: 1 as const,
    cursor: 10,
    totalEvents: 10,
    isLive: true,
    onToggle: vi.fn(),
    onStep: vi.fn(),
    onSpeedChange: vi.fn(),
    onJumpToLive: vi.fn(),
};

describe('<PlaybackControls />', () => {
    it('renders the toolbar', () => {
        render(<PlaybackControls {...defaultProps} />);
        expect(screen.getByTestId('playback-controls')).toBeInTheDocument();
    });

    it('shows the Pause icon when playing', () => {
        render(<PlaybackControls {...defaultProps} playing={true} />);
        const btn = screen.getByTestId('playback-toggle');
        expect(btn.getAttribute('data-playing')).toBe('true');
        expect(btn.getAttribute('aria-label')).toContain('Pause');
    });

    it('shows the Play icon when paused', () => {
        render(<PlaybackControls {...defaultProps} playing={false} />);
        const btn = screen.getByTestId('playback-toggle');
        expect(btn.getAttribute('data-playing')).toBe('false');
        expect(btn.getAttribute('aria-label')).toContain('Play');
    });

    it('dispatches onToggle when the toggle button is clicked', () => {
        const onToggle = vi.fn();
        render(<PlaybackControls {...defaultProps} onToggle={onToggle} />);
        fireEvent.click(screen.getByTestId('playback-toggle'));
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('dispatches onStep when the step button is clicked', () => {
        const onStep = vi.fn();
        // Step is disabled when cursor === totalEvents; offset cursor.
        render(
            <PlaybackControls
                {...defaultProps}
                cursor={5}
                totalEvents={10}
                isLive={false}
                onStep={onStep}
            />,
        );
        fireEvent.click(screen.getByTestId('playback-step'));
        expect(onStep).toHaveBeenCalledOnce();
    });

    it('disables Step when cursor is at the head', () => {
        render(<PlaybackControls {...defaultProps} cursor={10} totalEvents={10} />);
        expect(screen.getByTestId('playback-step')).toBeDisabled();
    });

    it('shows the LIVE pill when isLive=true', () => {
        render(<PlaybackControls {...defaultProps} isLive={true} />);
        expect(screen.getByTestId('playback-live-pill')).toBeInTheDocument();
        expect(screen.queryByTestId('playback-cursor-jump')).not.toBeInTheDocument();
    });

    it('shows the cursor/total counter when not live', () => {
        render(<PlaybackControls {...defaultProps} cursor={7} totalEvents={20} isLive={false} />);
        const jump = screen.getByTestId('playback-cursor-jump');
        expect(jump).toBeInTheDocument();
        expect(jump.textContent).toContain('7/20');
        // Behind count.
        expect(jump.textContent).toContain('−13');
    });

    it('dispatches onJumpToLive when the cursor counter is clicked', () => {
        const onJumpToLive = vi.fn();
        render(
            <PlaybackControls
                {...defaultProps}
                cursor={5}
                totalEvents={10}
                isLive={false}
                onJumpToLive={onJumpToLive}
            />,
        );
        fireEvent.click(screen.getByTestId('playback-cursor-jump'));
        expect(onJumpToLive).toHaveBeenCalledOnce();
    });

    it('renders the four speed buttons and marks the active one', () => {
        render(<PlaybackControls {...defaultProps} speed={2} />);
        expect(screen.getByTestId('playback-speed-0.5')).toBeInTheDocument();
        expect(screen.getByTestId('playback-speed-1')).toBeInTheDocument();
        expect(screen.getByTestId('playback-speed-2')).toBeInTheDocument();
        expect(screen.getByTestId('playback-speed-4')).toBeInTheDocument();
        expect(screen.getByTestId('playback-speed-2')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('playback-speed-1')).toHaveAttribute('aria-pressed', 'false');
    });

    it('dispatches onSpeedChange with the picked speed', () => {
        const onSpeedChange = vi.fn();
        render(<PlaybackControls {...defaultProps} onSpeedChange={onSpeedChange} />);
        fireEvent.click(screen.getByTestId('playback-speed-4'));
        expect(onSpeedChange).toHaveBeenCalledWith(4);
        fireEvent.click(screen.getByTestId('playback-speed-0.5'));
        expect(onSpeedChange).toHaveBeenCalledWith(0.5);
    });
});
