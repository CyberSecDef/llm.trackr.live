import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { formPatch, setDataMock } = vi.hoisted(() => ({
    formPatch: vi.fn(),
    setDataMock: vi.fn(),
}));

vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
        useForm: (initial: Record<string, unknown>) => {
            const data = { ...initial };
            return {
                data,
                errors: {} as Record<string, string>,
                processing: false,
                setData: (key: string, value: unknown) => {
                    data[key] = value;
                    setDataMock(key, value);
                },
                patch: formPatch,
            };
        },
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Admin', email: 'admin@e.com', role: 'admin' } },
                errors: {},
                flash: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/admin/users',
            component: 'Admin/Users',
            version: null,
        }),
    };
});

import React from 'react';
import AdminUsers from '@/Pages/Admin/Users';

const baseUsers = {
    data: [
        {
            id: 1,
            name: 'Alice',
            email: 'a@example.com',
            avatar_url: null,
            role: 'admin' as const,
            max_runs_per_hour: 30,
            created_at: '2026-01-01T00:00:00Z',
        },
        {
            id: 2,
            name: null,
            email: 'b@example.com',
            avatar_url: null,
            role: 'user' as const,
            max_runs_per_hour: 10,
            created_at: '2026-01-02T00:00:00Z',
        },
    ],
    current_page: 1,
    last_page: 1,
    total: 2,
    links: [],
};

afterEach(() => {
    formPatch.mockReset();
    setDataMock.mockReset();
});

describe('<AdminUsers />', () => {
    it('renders one row per user', () => {
        render(<AdminUsers users={baseUsers} />);
        expect(screen.getByTestId('user-row-1')).toBeInTheDocument();
        expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
        // Null name renders as em dash.
        expect(screen.getByText('b@example.com')).toBeInTheDocument();
    });

    it('per-row rate-limit form posts on submit', () => {
        render(<AdminUsers users={baseUsers} />);
        fireEvent.submit(screen.getByTestId('rate-limit-form-1'));
        expect(formPatch).toHaveBeenCalled();
    });

    it('hides pagination when single-page', () => {
        render(<AdminUsers users={baseUsers} />);
        expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
    });

    it('shows pagination when last_page > 1', () => {
        render(
            <AdminUsers
                users={{
                    ...baseUsers,
                    last_page: 3,
                    links: [
                        { url: null, label: '&laquo;', active: false },
                        { url: '/admin/users?page=1', label: '1', active: true },
                        { url: '/admin/users?page=2', label: '2', active: false },
                    ],
                }}
            />,
        );
        expect(screen.getByTestId('pagination')).toBeInTheDocument();
    });
});
