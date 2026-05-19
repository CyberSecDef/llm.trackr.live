import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Override the default Inertia mock so AppLayout's auth.user check passes.
vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
        useForm: () => ({ post: vi.fn(), processing: false }),
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Alice', email: 'a@example.com', role: 'user' } },
                errors: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/dashboard',
            component: 'Dashboard',
            version: null,
        }),
    };
});

import React from 'react';
import Dashboard from '@/Pages/Dashboard';

const baseProps = {
    stats: { total_runs: 0, total_tokens: 0, total_cost: 0 },
    recent_threads: [],
    has_api_keys: true,
};

describe('<Dashboard />', () => {
    it('renders three stat cards', () => {
        render(<Dashboard {...baseProps} />);
        const grid = screen.getByTestId('stats-grid');
        expect(within(grid).getByText('Total runs')).toBeInTheDocument();
        expect(within(grid).getByText('Tokens generated')).toBeInTheDocument();
        expect(within(grid).getByText('Estimated cost')).toBeInTheDocument();
    });

    it('formats numeric stats with thousands separators', () => {
        render(
            <Dashboard
                {...baseProps}
                stats={{ total_runs: 12345, total_tokens: 1_234_567, total_cost: 0.4321 }}
            />,
        );
        const grid = screen.getByTestId('stats-grid');
        expect(within(grid).getByText('12,345')).toBeInTheDocument();
        expect(within(grid).getByText('1,234,567')).toBeInTheDocument();
        expect(within(grid).getByText('$0.4321')).toBeInTheDocument();
    });

    it('shows the no-API-key callout when has_api_keys is false', () => {
        render(<Dashboard {...baseProps} has_api_keys={false} />);
        expect(screen.getByTestId('no-api-key-callout')).toBeInTheDocument();
        const callout = screen.getByTestId('no-api-key-callout');
        expect(within(callout).getByRole('link', { name: /add a key/i })).toHaveAttribute(
            'href',
            '/api-keys',
        );
    });

    it('hides the no-API-key callout when has_api_keys is true', () => {
        render(<Dashboard {...baseProps} has_api_keys={true} />);
        expect(screen.queryByTestId('no-api-key-callout')).not.toBeInTheDocument();
    });

    it('renders the empty-threads CTA when no recent threads', () => {
        render(<Dashboard {...baseProps} recent_threads={[]} />);
        expect(screen.getByTestId('empty-threads')).toBeInTheDocument();
        expect(screen.queryByTestId('recent-threads-list')).not.toBeInTheDocument();
    });

    it('routes the empty-threads CTA to /api-keys when the user has no key', () => {
        render(<Dashboard {...baseProps} recent_threads={[]} has_api_keys={false} />);
        const empty = screen.getByTestId('empty-threads');
        const cta = within(empty).getByRole('link');
        expect(cta).toHaveAttribute('href', '/api-keys');
    });

    it('routes the empty-threads CTA to /threads when the user has a key', () => {
        render(<Dashboard {...baseProps} recent_threads={[]} has_api_keys={true} />);
        const empty = screen.getByTestId('empty-threads');
        const cta = within(empty).getByRole('link');
        expect(cta).toHaveAttribute('href', '/threads');
    });

    it('renders the recent threads list when threads are present', () => {
        render(
            <Dashboard
                {...baseProps}
                recent_threads={[
                    {
                        id: 1,
                        title: 'Quantum gradient descent',
                        last_activity_at: new Date(Date.now() - 30 * 60_000).toISOString(),
                        run_count: 5,
                        archived: false,
                    },
                    {
                        id: 2,
                        title: null,
                        last_activity_at: null,
                        run_count: 1,
                        archived: true,
                    },
                ]}
            />,
        );
        const list = screen.getByTestId('recent-threads-list');
        expect(within(list).getByText('Quantum gradient descent')).toBeInTheDocument();
        expect(within(list).getByText('Untitled thread')).toBeInTheDocument();
        // run counts + relative time + archived hint composed in one line:
        expect(within(list).getByText(/5 runs/)).toBeInTheDocument();
        expect(within(list).getByText(/archived/)).toBeInTheDocument();
        expect(screen.queryByTestId('empty-threads')).not.toBeInTheDocument();
    });
});
