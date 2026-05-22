import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    VectorInspectionProvider,
    useVectorInspection,
} from '@/Components/Viz/VectorInspectionContext';

function HookProbe() {
    const inspection = useVectorInspection();
    if (!inspection) {
        return <div data-testid="probe-no-context">no context</div>;
    }
    return (
        <div>
            <div data-testid="probe-active">
                {inspection.active
                    ? `${inspection.active.label}|${inspection.active.values.length}`
                    : 'empty'}
            </div>
            <button onClick={() => inspection.open([1, 2, 3], 'demo')}>open</button>
            <button onClick={inspection.close}>close</button>
        </div>
    );
}

describe('<VectorInspectionProvider />', () => {
    it('returns null outside a provider', () => {
        render(<HookProbe />);
        expect(screen.getByTestId('probe-no-context')).toBeInTheDocument();
    });

    it('starts with no active inspection', () => {
        render(
            <VectorInspectionProvider>
                <HookProbe />
            </VectorInspectionProvider>,
        );
        expect(screen.getByTestId('probe-active').textContent).toBe('empty');
    });

    it('open() sets the active inspection', () => {
        render(
            <VectorInspectionProvider>
                <HookProbe />
            </VectorInspectionProvider>,
        );
        fireEvent.click(screen.getByText('open'));
        expect(screen.getByTestId('probe-active').textContent).toBe('demo|3');
    });

    it('close() clears the active inspection', () => {
        render(
            <VectorInspectionProvider>
                <HookProbe />
            </VectorInspectionProvider>,
        );
        fireEvent.click(screen.getByText('open'));
        fireEvent.click(screen.getByText('close'));
        expect(screen.getByTestId('probe-active').textContent).toBe('empty');
    });
});
