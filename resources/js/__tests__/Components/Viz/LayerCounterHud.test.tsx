import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LayerCounterHud from '@/Components/Viz/LayerCounterHud';

describe('<LayerCounterHud />', () => {
    it('renders the placeholder dashes when no data is provided', () => {
        render(<LayerCounterHud visible={true} />);
        const value = screen.getByTestId('viz-layer-counter-value');
        expect(value.textContent).toBe('— / —');
    });

    it('renders "Layer 05 / 32" with zero-padding when data is provided', () => {
        render(<LayerCounterHud currentLayer={5} totalLayers={32} visible={true} />);
        const value = screen.getByTestId('viz-layer-counter-value');
        expect(value.textContent).toBe('05 / 32');
    });

    it('renders the progress bar width from currentLayer / totalLayers', () => {
        render(<LayerCounterHud currentLayer={16} totalLayers={32} visible={true} />);
        const bar = screen.getByTestId('viz-layer-counter-progress') as HTMLElement;
        // (16 - 1) / (32 - 1) ≈ 0.484 → 48.4%
        expect(bar.style.width).toMatch(/^48\./);
    });

    it('reports visible=true via data attribute and opacity-100 class', () => {
        const { container } = render(
            <LayerCounterHud currentLayer={5} totalLayers={32} visible={true} />,
        );
        const hud = container.querySelector('[data-testid="viz-layer-counter"]') as HTMLElement;
        expect(hud.getAttribute('data-visible')).toBe('true');
        expect(hud.className).toMatch(/opacity-100/);
    });

    it('hides via opacity-0 + aria-hidden when visible=false', () => {
        const { container } = render(
            <LayerCounterHud currentLayer={5} totalLayers={32} visible={false} />,
        );
        const hud = container.querySelector('[data-testid="viz-layer-counter"]') as HTMLElement;
        expect(hud.getAttribute('data-visible')).toBe('false');
        expect(hud.className).toMatch(/opacity-0/);
        expect(hud.getAttribute('aria-hidden')).toBe('true');
    });

    it('omits the progress bar when there is no data', () => {
        const { container } = render(<LayerCounterHud visible={true} />);
        expect(container.querySelector('[data-testid="viz-layer-counter-progress"]')).toBeNull();
    });

    it('uses an aria-label that names the layer position when visible', () => {
        render(<LayerCounterHud currentLayer={5} totalLayers={32} visible={true} />);
        const hud = screen.getByTestId('viz-layer-counter');
        expect(hud.getAttribute('aria-label')).toBe('Layer 5 of 32');
    });

    it('handles totalLayers = 1 without dividing by zero', () => {
        render(<LayerCounterHud currentLayer={1} totalLayers={1} visible={true} />);
        const bar = screen.getByTestId('viz-layer-counter-progress') as HTMLElement;
        expect(bar.style.width).toBe('0%');
    });
});
