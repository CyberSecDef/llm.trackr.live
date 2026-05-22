import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VectorStrip from '@/Components/Viz/VectorStrip';
import { VIRIDIS_STOPS } from '@/lib/palettes';
import {
    VectorInspectionProvider,
    useVectorInspection,
} from '@/Components/Viz/VectorInspectionContext';

function ActiveProbe() {
    const inspection = useVectorInspection();
    return (
        <div data-testid="probe">
            {inspection?.active
                ? `${inspection.active.label}|${inspection.active.values.length}`
                : 'empty'}
        </div>
    );
}

describe('<VectorStrip />', () => {
    it('renders one cell per visible value', () => {
        render(<VectorStrip values={[0, 0.25, 0.5, 0.75, 1]} />);
        const svg = screen.getByTestId('vector-strip-svg');
        expect(within(svg).getAllByTestId(/vector-strip-cell-/)).toHaveLength(5);
    });

    it('respects the visibleCells cap', () => {
        const values = Array.from({ length: 256 }, (_, i) => i);
        render(<VectorStrip values={values} visibleCells={64} />);
        const svg = screen.getByTestId('vector-strip-svg');
        expect(within(svg).getAllByTestId(/vector-strip-cell-/)).toHaveLength(64);
        // Truncation indicator should fire.
        expect(within(svg).getByTestId('vector-strip-truncation')).toBeInTheDocument();
    });

    it('aria-label mentions truncation when totalLength exceeds visible', () => {
        render(<VectorStrip values={[1, 2, 3]} visibleCells={64} totalLength={4096} />);
        const svg = screen.getByTestId('vector-strip-svg');
        expect(svg.getAttribute('aria-label')).toMatch(/3 of 4096/);
    });

    it('uses viridis colors for cells (low value → near first stop)', () => {
        render(<VectorStrip values={[0, 1]} />);
        const cell0 = screen.getByTestId('vector-strip-cell-0');
        // The lowest normalized value lands on the first viridis stop
        // (#440154 → rgb(68, 1, 84)). d3-style rgb() serialization.
        expect(cell0.getAttribute('fill')).toBe('rgb(68, 1, 84)');
        const cell1 = screen.getByTestId('vector-strip-cell-1');
        // The highest normalized value lands on the last viridis stop
        // (#fde725 → rgb(253, 231, 37)).
        expect(cell1.getAttribute('fill')).toBe('rgb(253, 231, 37)');
        // Sanity that the palette source-of-truth still ships these
        // exact endpoints.
        expect(VIRIDIS_STOPS[0]).toBe('#440154');
        expect(VIRIDIS_STOPS[VIRIDIS_STOPS.length - 1]).toBe('#fde725');
    });

    it('renders the caption above the svg when provided', () => {
        render(<VectorStrip values={[0, 1]} caption="Layer 5 output" />);
        expect(screen.getByText('Layer 5 output')).toBeInTheDocument();
    });

    it('returns no cells for an empty vector (still mounts the svg)', () => {
        render(<VectorStrip values={[]} />);
        expect(screen.getByTestId('vector-strip-svg')).toBeInTheDocument();
        expect(screen.queryAllByTestId(/vector-strip-cell-/)).toHaveLength(0);
    });

    // M13 chunk 11b: click-to-inspect behaviour.

    it('is NOT inspectable outside a VectorInspectionProvider', () => {
        render(<VectorStrip values={[0.1, 0.2]} />);
        const svg = screen.getByTestId('vector-strip-svg');
        expect(svg.getAttribute('data-inspectable')).toBe('false');
        expect(svg.getAttribute('role')).toBe('img');
    });

    it('becomes inspectable inside a VectorInspectionProvider', () => {
        render(
            <VectorInspectionProvider>
                <VectorStrip values={[0.1, 0.2]} />
            </VectorInspectionProvider>,
        );
        const svg = screen.getByTestId('vector-strip-svg');
        expect(svg.getAttribute('data-inspectable')).toBe('true');
        expect(svg.getAttribute('role')).toBe('button');
        expect(svg.getAttribute('tabindex')).toBe('0');
    });

    it('clicking an inspectable strip opens the inspection with full values', () => {
        const values = [0.1, 0.2, 0.3];
        render(
            <VectorInspectionProvider>
                <VectorStrip values={values} inspectionLabel="my strip" />
                <ActiveProbe />
            </VectorInspectionProvider>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('empty');
        fireEvent.click(screen.getByTestId('vector-strip-svg'));
        expect(screen.getByTestId('probe').textContent).toBe('my strip|3');
    });

    it('uses caption as fallback label when inspectionLabel is omitted', () => {
        render(
            <VectorInspectionProvider>
                <VectorStrip values={[1, 2]} caption="Caption fallback" />
                <ActiveProbe />
            </VectorInspectionProvider>,
        );
        fireEvent.click(screen.getByTestId('vector-strip-svg'));
        expect(screen.getByTestId('probe').textContent).toBe('Caption fallback|2');
    });

    it('Enter key opens inspection on a focused inspectable strip', () => {
        render(
            <VectorInspectionProvider>
                <VectorStrip values={[1, 2]} inspectionLabel="keys" />
                <ActiveProbe />
            </VectorInspectionProvider>,
        );
        fireEvent.keyDown(screen.getByTestId('vector-strip-svg'), { key: 'Enter' });
        expect(screen.getByTestId('probe').textContent).toBe('keys|2');
    });

    it('Space key opens inspection on a focused inspectable strip', () => {
        render(
            <VectorInspectionProvider>
                <VectorStrip values={[1, 2]} inspectionLabel="space" />
                <ActiveProbe />
            </VectorInspectionProvider>,
        );
        fireEvent.keyDown(screen.getByTestId('vector-strip-svg'), { key: ' ' });
        expect(screen.getByTestId('probe').textContent).toBe('space|2');
    });

    it('does not open inspection when values is empty', () => {
        render(
            <VectorInspectionProvider>
                <VectorStrip values={[]} />
                <ActiveProbe />
            </VectorInspectionProvider>,
        );
        const svg = screen.getByTestId('vector-strip-svg');
        expect(svg.getAttribute('data-inspectable')).toBe('false');
        fireEvent.click(svg);
        expect(screen.getByTestId('probe').textContent).toBe('empty');
    });
});
