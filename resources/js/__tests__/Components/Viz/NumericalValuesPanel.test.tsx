import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import NumericalValuesPanel from '@/Components/Viz/NumericalValuesPanel';
import {
    VectorInspectionProvider,
    useVectorInspection,
} from '@/Components/Viz/VectorInspectionContext';

function AutoOpener({ values, label }: { values: readonly number[]; label?: string }) {
    const inspection = useVectorInspection();
    const open = inspection?.open;
    useEffect(() => {
        if (open && values.length > 0) open(values, label);
    }, [open, values, label]);
    return null;
}

function wrap(values: readonly number[], label?: string) {
    return render(
        <VectorInspectionProvider>
            <AutoOpener values={values} label={label} />
            <NumericalValuesPanel />
        </VectorInspectionProvider>,
    );
}

describe('<NumericalValuesPanel />', () => {
    it('renders nothing when no inspection is active', () => {
        render(
            <VectorInspectionProvider>
                <NumericalValuesPanel />
            </VectorInspectionProvider>,
        );
        expect(screen.queryByTestId('viz-inspection-panel')).not.toBeInTheDocument();
    });

    it('renders the panel when inspection is active', () => {
        wrap([0.1, 0.2, 0.3], 'demo vector');
        expect(screen.getByTestId('viz-inspection-panel')).toBeInTheDocument();
        expect(screen.getByTestId('viz-inspection-label').textContent).toBe('demo vector');
    });

    it('shows stats: dim / mean / std / range', () => {
        wrap([1, 2, 3, 4], 'stats vec');
        const stats = screen.getByTestId('viz-inspection-stats');
        expect(stats.textContent).toContain('dim');
        expect(stats.textContent).toContain('mean');
        expect(stats.textContent).toContain('std');
        expect(stats.textContent).toContain('range');
        // mean of [1,2,3,4] = 2.5
        expect(screen.getByTestId('viz-inspection-stat-mean').textContent).toBe('2.500');
    });

    it('caps cell list at 64 entries', () => {
        const big = Array.from({ length: 100 }, (_, i) => i / 100);
        wrap(big, 'big vec');
        const cells = screen.getAllByTestId(/^viz-inspection-cell-\d+$/);
        expect(cells.length).toBe(64);
    });

    it('shows the "of N" suffix when values exceed 64', () => {
        const big = Array.from({ length: 100 }, (_, i) => i);
        wrap(big);
        expect(screen.getByTestId('viz-inspection-cells-header').textContent).toContain('(of 100)');
    });

    it('omits the suffix when values fit in the cap', () => {
        wrap([1, 2, 3]);
        expect(screen.getByTestId('viz-inspection-cells-header').textContent).not.toContain('(of');
    });

    it('clicking the close button dismisses the panel', () => {
        wrap([1, 2, 3], 'closeable');
        fireEvent.click(screen.getByTestId('viz-inspection-close'));
        expect(screen.queryByTestId('viz-inspection-panel')).not.toBeInTheDocument();
    });

    it('clicking the backdrop dismisses the panel', () => {
        wrap([1, 2, 3]);
        fireEvent.click(screen.getByTestId('viz-inspection-backdrop'));
        expect(screen.queryByTestId('viz-inspection-panel')).not.toBeInTheDocument();
    });

    it('pressing Escape dismisses the panel', () => {
        wrap([1, 2, 3]);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByTestId('viz-inspection-panel')).not.toBeInTheDocument();
    });

    it('falls back to "Unnamed vector" when no label provided', () => {
        wrap([1, 2, 3]);
        expect(screen.getByTestId('viz-inspection-label').textContent).toBe('Unnamed vector');
    });

    it('shows the dim from the FULL vector, not the rendered cap', () => {
        const big = Array.from({ length: 200 }, (_, i) => i);
        wrap(big);
        expect(screen.getByTestId('viz-inspection-stat-dim').textContent).toBe('200');
    });
});
