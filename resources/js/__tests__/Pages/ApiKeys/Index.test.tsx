import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { formPost, routerDelete, setDataMock, formReset } = vi.hoisted(() => ({
    formPost: vi.fn(),
    routerDelete: vi.fn(),
    setDataMock: vi.fn(),
    formReset: vi.fn(),
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
                reset: formReset,
                setData: (key: string, value: unknown) => {
                    data[key] = value;
                    setDataMock(key, value);
                },
                post: formPost,
            };
        },
        router: { delete: routerDelete },
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Alice', email: 'a@example.com', role: 'user' } },
                errors: {},
                flash: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/api-keys',
            component: 'ApiKeys/Index',
            version: null,
        }),
    };
});

import React from 'react';
import ApiKeysIndex from '@/Pages/ApiKeys/Index';

const sampleKey = {
    id: 1,
    vendor: 'openai',
    label: null,
    last_four: '1234',
    masked: '••••1234',
    last_used_at: null,
    created_at: null,
};

afterEach(() => {
    formPost.mockReset();
    routerDelete.mockReset();
    setDataMock.mockReset();
    formReset.mockReset();
});

describe('<ApiKeysIndex />', () => {
    it('renders the add-key form + table', () => {
        render(<ApiKeysIndex apiKeys={[]} supportedVendors={['openai', 'anthropic']} />);
        expect(screen.getByTestId('add-key-form')).toBeInTheDocument();
        expect(screen.getByTestId('keys-table')).toBeInTheDocument();
    });

    it('shows the empty state when no keys', () => {
        render(<ApiKeysIndex apiKeys={[]} supportedVendors={['openai']} />);
        expect(screen.getByTestId('empty-keys')).toBeInTheDocument();
    });

    it('renders one row per key', () => {
        render(
            <ApiKeysIndex
                apiKeys={[sampleKey, { ...sampleKey, id: 2, label: 'work' }]}
                supportedVendors={['openai']}
            />,
        );
        expect(screen.getByTestId('key-row-1')).toBeInTheDocument();
        expect(screen.getByTestId('key-row-2')).toBeInTheDocument();
        expect(screen.queryByTestId('empty-keys')).not.toBeInTheDocument();
    });

    it('dispatches a POST when the add form is submitted', () => {
        render(<ApiKeysIndex apiKeys={[]} supportedVendors={['openai']} />);
        fireEvent.submit(screen.getByTestId('add-key-form'));
        expect(formPost).toHaveBeenCalled();
    });

    it('opens the delete confirm dialog (not a JS confirm) when Delete is clicked', async () => {
        const user = userEvent.setup();
        render(<ApiKeysIndex apiKeys={[sampleKey]} supportedVendors={['openai']} />);

        await user.click(screen.getByTestId('delete-key-1'));
        expect(screen.getByTestId('confirm-delete-key')).toBeInTheDocument();
    });

    it('dispatches DELETE only after confirm', async () => {
        const user = userEvent.setup();
        render(<ApiKeysIndex apiKeys={[sampleKey]} supportedVendors={['openai']} />);

        await user.click(screen.getByTestId('delete-key-1'));
        expect(routerDelete).not.toHaveBeenCalled();

        await user.click(screen.getByTestId('confirm-delete-key'));
        expect(routerDelete).toHaveBeenCalled();
    });

    it('Cancel closes the dialog without dispatching DELETE', async () => {
        const user = userEvent.setup();
        render(<ApiKeysIndex apiKeys={[sampleKey]} supportedVendors={['openai']} />);

        await user.click(screen.getByTestId('delete-key-1'));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(routerDelete).not.toHaveBeenCalled();
    });

    it('renders the vendor <select> with all supported vendors', () => {
        render(<ApiKeysIndex apiKeys={[]} supportedVendors={['openai', 'anthropic', 'google']} />);
        const select = screen.getByTestId('vendor-select');
        expect(within(select).getByText('openai')).toBeInTheDocument();
        expect(within(select).getByText('anthropic')).toBeInTheDocument();
        expect(within(select).getByText('google')).toBeInTheDocument();
    });
});
