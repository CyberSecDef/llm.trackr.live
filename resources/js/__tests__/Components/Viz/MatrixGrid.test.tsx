import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MatrixGrid from '@/Components/Viz/MatrixGrid';

describe('<MatrixGrid />', () => {
    it('renders rows × cols cells', () => {
        const m = [
            [0, 1],
            [2, 3],
        ];
        render(<MatrixGrid values={m} maxVisible={4} size={100} />);
        const svg = screen.getByTestId('matrix-grid-svg');
        expect(within(svg).getAllByTestId(/matrix-grid-cell-/)).toHaveLength(4);
    });

    it('clamps to maxVisible on both axes', () => {
        const m = Array.from({ length: 64 }, () => Array.from({ length: 64 }, (_, c) => c));
        render(<MatrixGrid values={m} maxVisible={8} />);
        const svg = screen.getByTestId('matrix-grid-svg');
        expect(within(svg).getAllByTestId(/matrix-grid-cell-/)).toHaveLength(8 * 8);
        expect(within(svg).getByTestId('matrix-grid-truncation')).toBeInTheDocument();
    });

    it('aria-label reports "showing R×C of total_rows × total_cols" when truncated', () => {
        const m = [
            [0, 1, 2],
            [3, 4, 5],
        ];
        render(<MatrixGrid values={m} totalRows={128000} totalCols={4096} maxVisible={2} />);
        const svg = screen.getByTestId('matrix-grid-svg');
        expect(svg.getAttribute('aria-label')).toMatch(/2×2 of 128000×4096/);
    });

    it('encodes lowest value on first viridis stop and highest on last', () => {
        const m = [[0, 1]];
        render(<MatrixGrid values={m} maxVisible={4} size={100} />);
        expect(screen.getByTestId('matrix-grid-cell-0-0').getAttribute('fill')).toBe(
            'rgb(68, 1, 84)',
        );
        expect(screen.getByTestId('matrix-grid-cell-0-1').getAttribute('fill')).toBe(
            'rgb(253, 231, 37)',
        );
    });

    it('handles an empty matrix without crashing', () => {
        render(<MatrixGrid values={[]} />);
        expect(screen.getByTestId('matrix-grid-svg')).toBeInTheDocument();
        expect(screen.queryAllByTestId(/matrix-grid-cell-/)).toHaveLength(0);
    });
});
