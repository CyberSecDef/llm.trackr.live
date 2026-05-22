import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    PerformanceModeProvider,
    usePerformanceMode,
} from '@/Components/Viz/PerformanceModeContext';

function Probe() {
    const { fps, degraded } = usePerformanceMode();
    return (
        <div data-testid="probe">
            {fps}|{degraded ? 'yes' : 'no'}
        </div>
    );
}

describe('PerformanceModeContext', () => {
    it('returns the safe default outside any provider', () => {
        render(<Probe />);
        expect(screen.getByTestId('probe').textContent).toBe('0|no');
    });

    it('flows the provider value down to consumers', () => {
        render(
            <PerformanceModeProvider value={{ fps: 22, degraded: true }}>
                <Probe />
            </PerformanceModeProvider>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('22|yes');
    });

    it('updates when the provider value changes', () => {
        const { rerender } = render(
            <PerformanceModeProvider value={{ fps: 30, degraded: false }}>
                <Probe />
            </PerformanceModeProvider>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('30|no');
        rerender(
            <PerformanceModeProvider value={{ fps: 12, degraded: true }}>
                <Probe />
            </PerformanceModeProvider>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('12|yes');
    });
});
