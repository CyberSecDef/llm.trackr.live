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
                auth: { user: { id: 1, name: 'Admin', email: 'a@e.com', role: 'admin' } },
                errors: {},
                flash: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/admin/models/1/edit',
            component: 'Admin/Models/Edit',
            version: null,
        }),
    };
});

import React from 'react';
import AdminModelEdit from '@/Pages/Admin/Models/Edit';

const sampleModel = {
    id: 1,
    vendor: 'openai',
    name: 'gpt-4o',
    display_name: 'GPT-4o',
    api_base_url: null,
    architecture_type: 'dense',
    layers: 80,
    hidden_dim: 4096,
    attention_heads: 32,
    moe_experts: null,
    moe_active_experts: null,
    position_encoding: 'rope',
    context_length: 128000,
    pricing_input_per_million: 5.0,
    pricing_output_per_million: 15.0,
    supports_streaming: true,
    supports_logprobs: false,
    supports_seed: false,
    chat_template: null,
    manual_override: false,
    metadata_estimated: false,
};

afterEach(() => {
    formPatch.mockReset();
    setDataMock.mockReset();
});

describe('<AdminModelEdit />', () => {
    it('renders the form with the model identity in the header', () => {
        render(
            <AdminModelEdit
                model={sampleModel}
                architectureTypes={['dense', 'moe']}
                positionEncodings={['rope', 'alibi']}
            />,
        );
        expect(screen.getByTestId('edit-model-form')).toBeInTheDocument();
        expect(screen.getByText('GPT-4o')).toBeInTheDocument();
        expect(screen.getByText('openai/gpt-4o')).toBeInTheDocument();
    });

    it('shows the "estimated" notice when metadata_estimated', () => {
        render(
            <AdminModelEdit
                model={{ ...sampleModel, metadata_estimated: true }}
                architectureTypes={['dense']}
                positionEncodings={['rope']}
            />,
        );
        expect(screen.getByTestId('estimated-notice')).toBeInTheDocument();
    });

    it('PATCHes on submit', () => {
        render(
            <AdminModelEdit
                model={sampleModel}
                architectureTypes={['dense']}
                positionEncodings={['rope']}
            />,
        );
        fireEvent.submit(screen.getByTestId('edit-model-form'));
        expect(formPatch).toHaveBeenCalled();
    });
});
