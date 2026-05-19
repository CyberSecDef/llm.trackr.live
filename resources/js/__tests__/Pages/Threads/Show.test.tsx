import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { routerGet, routerPatch, routerDelete, formPatch, formPost, setDataMock } = vi.hoisted(
    () => ({
        routerGet: vi.fn(),
        routerPatch: vi.fn(),
        routerDelete: vi.fn(),
        formPatch: vi.fn(),
        formPost: vi.fn(),
        setDataMock: vi.fn(),
    }),
);

vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
        useForm: (initial: Record<string, unknown>) => {
            // Minimal useForm stub — captures setData calls + reports
            // current data. Each call to useForm gets its own data
            // object so the title form + prompt form don't collide.
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
                post: formPost,
                reset: vi.fn(),
            };
        },
        router: { get: routerGet, patch: routerPatch, delete: routerDelete },
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Alice', email: 'a@example.com', role: 'user' } },
                errors: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/threads/1',
            component: 'Threads/Show',
            version: null,
        }),
    };
});

import React from 'react';
import ThreadShow from '@/Pages/Threads/Show';

const baseThread = {
    id: 1,
    title: 'Quantum entanglement',
    archived: false,
    tags: [],
    last_activity_at: null,
    created_at: '2026-05-18T00:00:00Z',
    default_model_id: null,
};

const oneModel = [
    {
        id: 10,
        vendor: 'openai',
        name: 'gpt-4o',
        display_name: 'GPT-4o',
        context_length: 128000,
    },
];

const sampleRun = {
    id: 100,
    sequence_in_thread: 1,
    status: 'complete' as const,
    prompt: 'What is 2+2?',
    output_text: '4',
    error_message: null,
    input_tokens: 10,
    output_tokens: 1,
    duration_ms: 250,
    estimated_cost: 0.0001,
    model_id: 10,
    created_at: '2026-05-18T00:00:00Z',
};

afterEach(() => {
    routerGet.mockReset();
    routerPatch.mockReset();
    routerDelete.mockReset();
    formPatch.mockReset();
    formPost.mockReset();
    setDataMock.mockReset();
});

describe('<ThreadShow /> — header', function () {
    it('renders the thread title', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByText('Quantum entanglement')).toBeInTheDocument();
    });

    it('renders "Untitled thread" when title is null', function () {
        render(
            <ThreadShow
                thread={{ ...baseThread, title: null }}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByText('Untitled thread')).toBeInTheDocument();
    });

    it('shows an "archived" badge when archived', function () {
        render(
            <ThreadShow
                thread={{ ...baseThread, archived: true }}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByText('archived')).toBeInTheDocument();
    });

    it('toggles the archive action and dispatches a PATCH', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('toggle-archive'));
        expect(routerPatch).toHaveBeenCalledWith(
            '/threads/1',
            { archived: true },
            expect.objectContaining({ preserveScroll: true }),
        );
    });

    it('opens the title edit form on click and shows Save / Cancel', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('edit-title'));
        expect(screen.getByTestId('title-form')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('opens the delete confirm dialog and dispatches DELETE on confirm', async function () {
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );

        await user.click(screen.getByTestId('delete-trigger'));
        expect(screen.getByText(/permanently removes/)).toBeInTheDocument();

        await user.click(screen.getByTestId('delete-confirm'));
        expect(routerDelete).toHaveBeenCalledWith('/threads/1');
    });

    it('does not dispatch DELETE when the dialog is cancelled', async function () {
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );

        await user.click(screen.getByTestId('delete-trigger'));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(routerDelete).not.toHaveBeenCalled();
    });
});

describe('<ThreadShow /> — transcript', function () {
    it('shows the empty-transcript state when no runs exist', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('empty-transcript')).toBeInTheDocument();
    });

    it('renders one card per run with status badge + prompt + output', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[sampleRun]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('run-100');
        expect(within(card).getByText('Run #1')).toBeInTheDocument();
        expect(within(card).getByText('Complete')).toBeInTheDocument();
        expect(within(card).getByText('What is 2+2?')).toBeInTheDocument();
        expect(within(card).getByText('4')).toBeInTheDocument();
        expect(within(card).getByText(/10 in · 1 out/)).toBeInTheDocument();
    });

    it('renders error messages for errored runs', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        status: 'error',
                        error_message: 'Vendor rate-limited',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByText('Vendor rate-limited')).toBeInTheDocument();
        expect(screen.getByText('Error')).toBeInTheDocument();
    });
});

describe('<ThreadShow /> — prompt footer', function () {
    it('shows the no-API-key footer when has_api_keys is false', function () {
        render(
            <ThreadShow thread={baseThread} runs={[]} usable_models={[]} has_api_keys={false} />,
        );
        expect(screen.getByTestId('no-api-key-footer')).toBeInTheDocument();
        expect(screen.queryByTestId('prompt-form')).not.toBeInTheDocument();
    });

    it('shows the no-usable-models footer when has key but no models', function () {
        render(<ThreadShow thread={baseThread} runs={[]} usable_models={[]} has_api_keys={true} />);
        expect(screen.getByTestId('no-usable-models')).toBeInTheDocument();
        expect(screen.queryByTestId('prompt-form')).not.toBeInTheDocument();
    });

    it('renders the prompt form when key + models exist', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('prompt-form')).toBeInTheDocument();
        expect(screen.getByTestId('prompt-textarea')).toBeInTheDocument();
        expect(screen.getByTestId('model-select')).toBeInTheDocument();
    });

    it('disables Submit while the prompt is empty', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('submit-prompt')).toBeDisabled();
    });

    it('lists usable models grouped by vendor in the select', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={[
                    {
                        id: 1,
                        vendor: 'openai',
                        name: 'gpt-4o',
                        display_name: 'GPT-4o',
                        context_length: 128000,
                    },
                    {
                        id: 2,
                        vendor: 'anthropic',
                        name: 'claude-3',
                        display_name: 'Claude 3',
                        context_length: 200000,
                    },
                ]}
                has_api_keys={true}
            />,
        );
        const select = screen.getByTestId('model-select');
        expect(within(select).getByText('GPT-4o')).toBeInTheDocument();
        expect(within(select).getByText('Claude 3')).toBeInTheDocument();
        // optgroups by vendor
        const optgroups = select.querySelectorAll('optgroup');
        expect(optgroups).toHaveLength(2);
    });

    it('posts to /threads/{id}/runs when the form is submitted', async function () {
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );

        await user.type(screen.getByTestId('prompt-textarea'), 'Hello');
        fireEvent.submit(screen.getByTestId('prompt-form').querySelector('form')!);
        expect(formPost).toHaveBeenCalledWith('/threads/1/runs', expect.any(Object));
    });
});
