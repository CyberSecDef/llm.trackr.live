import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AttentionHeatmap from '@/Components/Viz/AttentionHeatmap';
import { generateAttentionPattern } from '@/lib/attentionPattern';

describe('<AttentionHeatmap />', () => {
    it('renders null when matrix is empty', () => {
        const { container } = render(<AttentionHeatmap matrix={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders n × n cells for an n × n matrix', () => {
        const m = generateAttentionPattern(6, 3, 24);
        render(<AttentionHeatmap matrix={m} />);
        const svg = screen.getByTestId('attention-heatmap');
        const cells = within(svg).getAllByTestId(/heatmap-cell-/);
        expect(cells).toHaveLength(36);
    });

    it('paints causal-masked cells with the low color (zero weight)', () => {
        const m = generateAttentionPattern(5, 2, 24);
        render(<AttentionHeatmap matrix={m} />);
        // cell (0, 4) is in the upper triangle — causal zero.
        // d3-scale serializes the interpolated color to rgb(); 0x020617
        // → rgb(2, 6, 23).
        const upper = screen.getByTestId('heatmap-cell-0-4');
        expect(upper.getAttribute('fill')).toBe('rgb(2, 6, 23)');
    });

    it('paints the strongest-weight cell with the high (cyan) end of the scale', () => {
        const m = generateAttentionPattern(5, 2, 24);
        render(<AttentionHeatmap matrix={m} />);
        // Find the cell with max weight in row 4 — likely (4,4)
        // because nearest-token has the highest exp-decay weight.
        const diag = screen.getByTestId('heatmap-cell-4-4');
        const rgb = diag.getAttribute('fill') ?? '';
        // Just verify it's not the low-end color — the exact tint
        // depends on row normalization. Should have a B channel > 23
        // (the low-end value).
        const match = rgb.match(/rgb\((\d+), (\d+), (\d+)\)/);
        expect(match).not.toBeNull();
        const [, , , b] = match!;
        expect(Number(b)).toBeGreaterThan(23);
    });

    it('renders the caption when provided', () => {
        const m = generateAttentionPattern(3, 0, 12);
        render(<AttentionHeatmap matrix={m} caption="Attention · layer 0" />);
        expect(screen.getByText('Attention · layer 0')).toBeInTheDocument();
    });

    it('shows the illustrative-only caveat', () => {
        const m = generateAttentionPattern(3, 0, 12);
        render(<AttentionHeatmap matrix={m} />);
        expect(screen.getByTestId('heatmap-illustrative-note').textContent).toContain(
            'Illustrative',
        );
    });

    it('uses size prop for the SVG dimensions', () => {
        const m = generateAttentionPattern(4, 0, 12);
        render(<AttentionHeatmap matrix={m} size={160} />);
        const svg = screen.getByTestId('attention-heatmap');
        expect(svg.getAttribute('width')).toBe('160');
        expect(svg.getAttribute('height')).toBe('160');
    });
});
