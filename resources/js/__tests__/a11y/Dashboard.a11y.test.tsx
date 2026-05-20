import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '@/test/axe';

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

describe('Dashboard a11y', () => {
    it('has no axe violations in the empty / no-keys state', async () => {
        const { container } = render(
            <Dashboard
                stats={{ total_runs: 0, total_tokens: 0, total_cost: 0 }}
                recent_threads={[]}
                has_api_keys={false}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });

    it('has no axe violations with stats + recent threads', async () => {
        const { container } = render(
            <Dashboard
                stats={{ total_runs: 42, total_tokens: 13_700, total_cost: 0.34 }}
                recent_threads={[
                    {
                        id: 1,
                        title: 'Quantum brainstorm',
                        last_activity_at: new Date(Date.now() - 90_000).toISOString(),
                        run_count: 3,
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
                has_api_keys={true}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });
});
