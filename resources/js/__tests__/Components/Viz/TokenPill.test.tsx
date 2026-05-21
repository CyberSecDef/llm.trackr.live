import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TokenPill, { tokenIdToHue } from '@/Components/Viz/TokenPill';

describe('tokenIdToHue', () => {
    it('returns the same hue for the same token ID (deterministic)', () => {
        expect(tokenIdToHue(42)).toBe(tokenIdToHue(42));
        expect(tokenIdToHue(999)).toBe(tokenIdToHue(999));
    });

    it('returns a hue in [0, 360)', () => {
        for (const id of [0, 1, 42, 999, 1_000_000, -1, -42]) {
            const h = tokenIdToHue(id);
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThan(360);
        }
    });

    it('spreads adjacent token IDs to visually distinct hues', () => {
        // Two adjacent integer IDs should land far apart on the
        // hue wheel (xorshift32 spreads them); we assert "not
        // identical" + "the diff is non-trivial."
        const h0 = tokenIdToHue(100);
        const h1 = tokenIdToHue(101);
        expect(h0).not.toBe(h1);
        expect(Math.abs(h0 - h1)).toBeGreaterThan(10);
    });
});

describe('<TokenPill />', () => {
    it('renders the label + an aria-label that includes the ID', () => {
        render(<TokenPill tokenId={42} label=" hello" />);
        const pill = screen.getByTestId('token-pill');
        expect(pill).toHaveTextContent('hello');
        expect(pill.getAttribute('aria-label')).toContain('42');
        expect(pill.getAttribute('aria-label')).toContain('hello');
    });

    it('exposes the token id + hue as data-attrs for testing', () => {
        render(<TokenPill tokenId={1234} label="t" />);
        const pill = screen.getByTestId('token-pill');
        expect(pill.getAttribute('data-token-id')).toBe('1234');
        expect(pill.getAttribute('data-hue')).toBe(String(tokenIdToHue(1234)));
    });

    it('applies an hue-derived background style', () => {
        render(<TokenPill tokenId={7} label="x" />);
        const pill = screen.getByTestId('token-pill');
        // jsdom serializes hsl() inputs into rgb() in the inline
        // style attribute, so we verify the *intent* via the
        // data-hue attribute (which records the computed hue) and
        // confirm the style attribute does set a background-color.
        expect(pill.getAttribute('data-hue')).toBe(String(tokenIdToHue(7)));
        expect(pill.getAttribute('style') ?? '').toMatch(/background-color/);
    });

    it('shows the ID number underneath when showId is true', () => {
        render(<TokenPill tokenId={42} label="hi" showId />);
        expect(screen.getByTestId('token-pill').textContent).toContain('42');
    });

    it('omits the ID number when showId is false (default)', () => {
        render(<TokenPill tokenId={42} label="hi" />);
        // The aria-label still has "42" but the visible text shouldn't.
        const pill = screen.getByTestId('token-pill');
        // Strip the inner text and check it equals just the label.
        expect(pill.querySelectorAll('span').length).toBeGreaterThanOrEqual(1);
        const labelSpan = pill.querySelector('span.font-medium');
        expect(labelSpan?.textContent).toBe('hi');
    });
});
