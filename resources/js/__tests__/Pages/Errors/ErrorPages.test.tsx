import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
        usePage: () => ({
            props: { auth: { user: null }, errors: {}, ziggy: { location: 'http://localhost' } },
            url: '/',
            component: 'Errors/NotFound',
            version: null,
        }),
    };
});

import React from 'react';
import NotFound from '@/Pages/Errors/NotFound';
import ServerError from '@/Pages/Errors/ServerError';
import Maintenance from '@/Pages/Errors/Maintenance';
import Expired from '@/Pages/Errors/Expired';
import Forbidden from '@/Pages/Errors/Forbidden';

const cases: Array<{
    name: string;
    Component: React.ComponentType;
    status: string;
    headline: RegExp;
}> = [
    { name: '404', Component: NotFound, status: 'Error 404', headline: /Page not found/i },
    { name: '403', Component: Forbidden, status: 'Error 403', headline: /Forbidden/i },
    { name: '419', Component: Expired, status: 'Error 419', headline: /Session expired/i },
    { name: '500', Component: ServerError, status: 'Error 500', headline: /Something went wrong/i },
    { name: '503', Component: Maintenance, status: 'Error 503', headline: /We'll be right back/i },
];

describe.each(cases)('<$name error page />', ({ Component, status, headline }) => {
    it('renders the status line + headline', () => {
        render(<Component />);
        expect(screen.getByText(status)).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: headline })).toBeInTheDocument();
    });

    it('renders an icon (M12 chunk 7 visual differentiation)', () => {
        render(<Component />);
        const icon = screen.getByTestId('error-icon');
        expect(icon).toBeInTheDocument();
        expect(icon.querySelector('svg')).not.toBeNull();
    });

    it('renders the Go back secondary CTA', () => {
        render(<Component />);
        expect(screen.getByTestId('error-go-back')).toBeInTheDocument();
    });

    it('renders the AGPL §13 Source link', () => {
        render(<Component />);
        const source = screen.getByRole('link', { name: /Source/i });
        expect(source).toHaveAttribute('href', 'https://github.com/CyberSecDef/llm.trackr.live');
    });

    it('renders the Sign in primary CTA for unauthed visitors', () => {
        render(<Component />);
        expect(screen.getByRole('link', { name: /Sign in/i })).toHaveAttribute('href', '/login');
    });
});

describe('Go back CTA behavior', () => {
    let historySpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        historySpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    });
    afterEach(() => historySpy.mockRestore());

    it('calls window.history.back() when history is non-empty', () => {
        // jsdom defaults to history.length = 1 (the initial page);
        // push a state so the back-button branch fires.
        window.history.pushState({}, '', '/somewhere-else');
        render(<NotFound />);
        fireEvent.click(screen.getByTestId('error-go-back'));
        expect(historySpy).toHaveBeenCalledTimes(1);
    });
});

// Note: per-auth-state CTA branching ("Sign in" vs "Back to
// dashboard") is exercised in the existing M7 Pages/Errors
// integration; running it inline here would require a re-import
// dance with vi.doMock that fights vi's module cache. The
// auth.user === null path is covered by the describe.each block
// above.
