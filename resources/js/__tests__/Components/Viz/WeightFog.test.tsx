import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WeightFog from '@/Components/Viz/WeightFog';

describe('<WeightFog />', () => {
    it('renders an SVG of the requested size', () => {
        render(<WeightFog width={320} height={240} />);
        const fog = screen.getByTestId('weight-fog');
        expect(fog.getAttribute('width')).toBe('320');
        expect(fog.getAttribute('height')).toBe('240');
    });

    it('is presentation-only + aria-hidden', () => {
        render(<WeightFog width={100} height={100} />);
        const fog = screen.getByTestId('weight-fog');
        expect(fog.getAttribute('role')).toBe('presentation');
        expect(fog.getAttribute('aria-hidden')).toBe('true');
    });

    it('builds a unique pattern id from props so multiple fogs can coexist', () => {
        const { container } = render(
            <>
                <WeightFog width={100} height={100} density={10} />
                <WeightFog width={200} height={200} density={10} />
            </>,
        );
        const patterns = container.querySelectorAll('pattern');
        const ids = Array.from(patterns).map((p) => p.getAttribute('id'));
        // Two unique ids, no duplicates.
        expect(new Set(ids).size).toBe(2);
    });

    it('respects the density prop', () => {
        render(<WeightFog width={100} height={100} density={20} />);
        expect(screen.getByTestId('weight-fog').getAttribute('data-density')).toBe('20');
    });
});
