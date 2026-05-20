import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VizSkeleton from '@/Components/VizSkeleton';

describe('<VizSkeleton />', () => {
    it('renders an aspect-square container with the supplied label', () => {
        render(<VizSkeleton testId="viz-loading" label="Loading visualization" />);
        const card = screen.getByTestId('viz-loading');
        expect(card).toBeInTheDocument();
        // The role="status" + aria-label make the loading state
        // discoverable to screen readers without sighted users
        // having to wait for the canvas to actually render.
        const status = card.querySelector('[role="status"]');
        expect(status).not.toBeNull();
        expect(status!.getAttribute('aria-label')).toBe('Loading visualization');
    });

    it('hosts the Skeleton primitive inside the placeholder square', () => {
        render(<VizSkeleton testId="viz-loading" label="Loading visualization" />);
        expect(screen.getByTestId('viz-loading-skeleton')).toBeInTheDocument();
    });

    it('echoes the label in the bottom caption strip', () => {
        render(<VizSkeleton testId="emb-loading" label="Loading embedding scatter" />);
        expect(screen.getByText(/Loading embedding scatter…/)).toBeInTheDocument();
    });

    it('Skeleton uses motion-safe:animate-pulse to honor prefers-reduced-motion', () => {
        render(<VizSkeleton testId="viz-loading" label="Loading visualization" />);
        const sk = screen.getByTestId('viz-loading-skeleton');
        const cls = sk.getAttribute('class') || '';
        expect(cls).toContain('motion-safe:animate-pulse');
        expect(/(^|\s)animate-pulse(\s|$)/.test(cls)).toBe(false);
    });
});
