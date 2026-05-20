import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AttentionHeatmap from '@/Components/Viz/AttentionHeatmap';
import { generateAttentionPattern } from '@/lib/attentionPattern';
import { VIRIDIS_STOPS } from '@/lib/palettes';

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

    it('paints causal-masked cells with the viridis low stop (zero weight)', () => {
        const m = generateAttentionPattern(5, 2, 24);
        render(<AttentionHeatmap matrix={m} />);
        // cell (0, 4) is in the upper triangle — causal zero.
        // M12 chunk 4: low stop is viridis #440154 → rgb(68, 1, 84).
        const upper = screen.getByTestId('heatmap-cell-0-4');
        expect(upper.getAttribute('fill')).toBe('rgb(68, 1, 84)');
    });

    it('paints the strongest-weight cell well past the viridis low stop', () => {
        const m = generateAttentionPattern(5, 2, 24);
        render(<AttentionHeatmap matrix={m} />);
        // Find the cell with max weight in row 4 — likely (4,4)
        // because nearest-token has the highest exp-decay weight.
        const diag = screen.getByTestId('heatmap-cell-4-4');
        const rgb = diag.getAttribute('fill') ?? '';
        const match = rgb.match(/rgb\((\d+), (\d+), (\d+)\)/);
        expect(match).not.toBeNull();
        const [, r, g, b] = match!;
        // Viridis low stop is rgb(68, 1, 84). Strongest-weight cell
        // should have moved off it — at least one channel notably
        // different.
        const offLow =
            Math.abs(Number(r) - 68) + Math.abs(Number(g) - 1) + Math.abs(Number(b) - 84) > 30;
        expect(offLow).toBe(true);
    });

    it('uses the viridis palette (M12 chunk 4)', () => {
        const matrix = [
            [0, 1],
            [1, 0],
        ];
        const { container } = render(<AttentionHeatmap matrix={matrix} />);
        const html = container.innerHTML;
        // Old M8 endpoints must be gone:
        expect(html.toLowerCase()).not.toContain('#67e8f9');
        expect(html).not.toContain('rgb(103, 232, 249)'); // cyan-300 rgb form
        expect(html).not.toContain('rgb(2, 6, 23)'); // slate-950 rgb form
        // Sanity: palette module ships the canonical viridis stops.
        expect(VIRIDIS_STOPS.length).toBe(5);
        // aria-label calls out viridis so screen-reader users know
        // the palette they're inspecting.
        const svg = screen.getByTestId('attention-heatmap');
        expect(svg.getAttribute('aria-label')).toContain('viridis');
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
