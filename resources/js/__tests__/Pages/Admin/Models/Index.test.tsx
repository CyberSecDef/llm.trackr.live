import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { formGet, routerPost, routerDelete, setDataMock } = vi.hoisted(() => ({
    formGet: vi.fn(),
    routerPost: vi.fn(),
    routerDelete: vi.fn(),
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
                get: formGet,
            };
        },
        router: { post: routerPost, delete: routerDelete },
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Admin', email: 'a@e.com', role: 'admin' } },
                errors: {},
                flash: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/admin/models',
            component: 'Admin/Models/Index',
            version: null,
        }),
    };
});

import React from 'react';
import AdminModelsIndex from '@/Pages/Admin/Models/Index';

const sampleModel = {
    id: 1,
    vendor: 'openai',
    name: 'gpt-4o',
    display_name: 'GPT-4o',
    architecture_type: 'dense' as const,
    context_length: 128_000,
    pricing_input_per_million: 5.0,
    pricing_output_per_million: 15.0,
    manual_override: false,
    metadata_estimated: false,
};

const baseProps = {
    models: {
        data: [sampleModel],
        current_page: 1,
        last_page: 1,
        total: 1,
        links: [],
    },
    filters: { search: '', vendor: '', architecture: '' },
    vendors: ['openai', 'anthropic'],
};

afterEach(() => {
    formGet.mockReset();
    routerPost.mockReset();
    routerDelete.mockReset();
    setDataMock.mockReset();
});

describe('<AdminModelsIndex />', () => {
    it('renders the table + filter form', () => {
        render(<AdminModelsIndex {...baseProps} />);
        expect(screen.getByTestId('models-table')).toBeInTheDocument();
        expect(screen.getByTestId('filters-form')).toBeInTheDocument();
        expect(screen.getByTestId('model-row-1')).toBeInTheDocument();
    });

    it('shows empty state when no models match', () => {
        render(
            <AdminModelsIndex
                {...baseProps}
                models={{ ...baseProps.models, data: [], total: 0 }}
            />,
        );
        expect(screen.getByTestId('empty-models')).toBeInTheDocument();
    });

    it('refresh trigger opens the AlertDialog (not a JS confirm)', async () => {
        const user = userEvent.setup();
        render(<AdminModelsIndex {...baseProps} />);

        await user.click(screen.getByTestId('refresh-trigger'));
        expect(screen.getByTestId('confirm-refresh')).toBeInTheDocument();
        expect(routerPost).not.toHaveBeenCalled();

        await user.click(screen.getByTestId('confirm-refresh'));
        expect(routerPost).toHaveBeenCalled();
    });

    it('delete trigger opens the AlertDialog and dispatches DELETE on confirm', async () => {
        const user = userEvent.setup();
        render(<AdminModelsIndex {...baseProps} />);

        await user.click(screen.getByTestId('delete-model-1'));
        expect(screen.getByTestId('confirm-delete-model')).toBeInTheDocument();
        expect(routerDelete).not.toHaveBeenCalled();

        await user.click(screen.getByTestId('confirm-delete-model'));
        expect(routerDelete).toHaveBeenCalled();
    });

    it('filter form GETs on submit', () => {
        render(<AdminModelsIndex {...baseProps} />);
        fireEvent.submit(screen.getByTestId('filters-form'));
        expect(formGet).toHaveBeenCalled();
    });
});
