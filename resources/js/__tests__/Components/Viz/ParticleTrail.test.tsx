import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ParticleTrail from '@/Components/Viz/ParticleTrail';
import { tokenIdToHue } from '@/Components/Viz/TokenPill';

describe('<ParticleTrail />', () => {
    it('renders a guide line + pulse by default', () => {
        render(
            <ParticleTrail
                from={{ x: 10, y: 20 }}
                to={{ x: 100, y: 200 }}
                width={120}
                height={220}
            />,
        );
        expect(screen.getByTestId('particle-trail-guide')).toBeInTheDocument();
        expect(screen.getByTestId('particle-trail-pulse')).toBeInTheDocument();
    });

    it('omits the guide line when showGuideLine is false', () => {
        render(
            <ParticleTrail
                from={{ x: 0, y: 0 }}
                to={{ x: 50, y: 50 }}
                width={50}
                height={50}
                showGuideLine={false}
            />,
        );
        expect(screen.queryByTestId('particle-trail-guide')).not.toBeInTheDocument();
        expect(screen.getByTestId('particle-trail-pulse')).toBeInTheDocument();
    });

    it('exposes from + to as data-attrs', () => {
        render(
            <ParticleTrail from={{ x: 5, y: 10 }} to={{ x: 15, y: 20 }} width={30} height={30} />,
        );
        const trail = screen.getByTestId('particle-trail');
        expect(trail.getAttribute('data-from-x')).toBe('5');
        expect(trail.getAttribute('data-from-y')).toBe('10');
        expect(trail.getAttribute('data-to-x')).toBe('15');
        expect(trail.getAttribute('data-to-y')).toBe('20');
    });

    it('hashes colorFromHash into an HSL hue (matches tokenIdToHue)', () => {
        render(
            <ParticleTrail
                from={{ x: 0, y: 0 }}
                to={{ x: 100, y: 100 }}
                width={100}
                height={100}
                colorFromHash={42}
            />,
        );
        const pulse = screen.getByTestId('particle-trail-pulse');
        const fill = pulse.getAttribute('fill') ?? '';
        expect(fill).toContain(`hsl(${tokenIdToHue(42)}deg`);
    });

    it('falls back to the neutral cyan when no colorFromHash is passed', () => {
        render(
            <ParticleTrail from={{ x: 0, y: 0 }} to={{ x: 10, y: 10 }} width={20} height={20} />,
        );
        const pulse = screen.getByTestId('particle-trail-pulse');
        expect(pulse.getAttribute('fill')).toBe('hsl(190deg 65% 55%)');
    });

    it('pulse uses motion-safe:[animation:...] so prefers-reduced-motion freezes it', () => {
        render(
            <ParticleTrail from={{ x: 0, y: 0 }} to={{ x: 50, y: 50 }} width={50} height={50} />,
        );
        const pulse = screen.getByTestId('particle-trail-pulse');
        const cls = pulse.getAttribute('class') ?? '';
        expect(cls).toContain('motion-safe:');
    });

    it('is aria-hidden (decorative)', () => {
        render(
            <ParticleTrail from={{ x: 0, y: 0 }} to={{ x: 10, y: 10 }} width={20} height={20} />,
        );
        const trail = screen.getByTestId('particle-trail');
        expect(trail.getAttribute('aria-hidden')).toBe('true');
        expect(trail.getAttribute('role')).toBe('presentation');
    });
});
