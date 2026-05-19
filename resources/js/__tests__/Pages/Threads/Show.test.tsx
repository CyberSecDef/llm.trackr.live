import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    routerGet,
    routerPatch,
    routerDelete,
    routerReload,
    formPatch,
    formPost,
    setDataMock,
    subscribedToRunId,
    mockStreamState,
} = vi.hoisted(() => ({
    routerGet: vi.fn(),
    routerPatch: vi.fn(),
    routerDelete: vi.fn(),
    routerReload: vi.fn(),
    formPatch: vi.fn(),
    formPost: vi.fn(),
    setDataMock: vi.fn(),
    subscribedToRunId: vi.fn(),
    // Mutable wrapper: tests reassign `mockStreamState.value` before
    // rendering to control what useRunStream returns. We can't hoist
    // a primitive that tests can swap, but we can hoist an object
    // whose `value` we reassign.
    mockStreamState: {
        value: {
            events: [] as Array<{ event: string; payload: Record<string, unknown> }>,
            status: 'idle' as 'idle' | 'streaming' | 'complete' | 'errored',
            transport: 'websocket' as 'websocket' | 'sse' | 'none',
            disabled: false,
        },
    },
}));

vi.mock('@/hooks/useRunStream', () => ({
    useRunStream: (runId: number | null) => {
        subscribedToRunId(runId);
        return mockStreamState.value;
    },
}));

// M8 chunk 1: stub the lazy-loaded VizPane so jsdom (no WebGL) doesn't
// blow up when ThreadShow renders the right pane. The toggle behavior
// + viz-aside wrapper are still observable in tests; full Three.js
// integration is covered separately.
vi.mock('@/Components/Viz/VizPane', () => ({
    default: ({ events, status }: { events: Array<{ event: string }>; status: string }) =>
        React.createElement(
            'div',
            { 'data-testid': 'viz-pane-stub' },
            `viz: ${status}, ${events.length} events`,
        ),
}));

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
        router: {
            get: routerGet,
            patch: routerPatch,
            delete: routerDelete,
            reload: routerReload,
        },
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

// Match PickerModel shape (M7 chunk 7 extended usable_models).
const oneModel = [
    {
        id: 10,
        vendor: 'openai',
        name: 'gpt-4o',
        display_name: 'GPT-4o',
        architecture_type: 'dense',
        position_encoding: 'rope',
        layers: 80,
        hidden_dim: 4096,
        attention_heads: 32,
        moe_experts: null,
        moe_active_experts: null,
        context_length: 128000,
        pricing_input_per_million: 5.0,
        pricing_output_per_million: 15.0,
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

// The preview hook fetches /threads/{id}/preview on a 400ms debounce.
// We stub fetch globally so the existing tests don't trigger real
// network calls; preview-specific tests below override the resolved
// value per-test.
beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn(() =>
        Promise.resolve({
            ok: true,
            json: () =>
                Promise.resolve({
                    history: [],
                    token_counts: { history: 0, prompt: 0, reserved: 0, total: 0 },
                    budget: 128000,
                    fits: true,
                    over_by: 0,
                    model: { id: 10, vendor: 'openai', name: 'gpt-4o', context_length: 128000 },
                }),
        }),
    );
});

afterEach(() => {
    routerGet.mockReset();
    routerPatch.mockReset();
    routerDelete.mockReset();
    routerReload.mockReset();
    formPatch.mockReset();
    formPost.mockReset();
    setDataMock.mockReset();
    subscribedToRunId.mockReset();
    // Reset the stream-state wrapper for the next test.
    mockStreamState.value = {
        events: [],
        status: 'idle',
        transport: 'websocket',
        disabled: false,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
    vi.useRealTimers();
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

    it('renders the model picker trigger (chunk 7)', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // chunk 7 swapped the native <select> for ModelPicker; the
        // test id stays so existing references keep working.
        const trigger = screen.getByTestId('model-select');
        expect(trigger).toHaveAttribute('role', 'combobox');
        expect(trigger.textContent).toContain('GPT-4o');
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

describe('<ThreadShow /> — preview panel (chunk 6a)', function () {
    /**
     * Replace the default fetch stub with a per-test response.
     */
    function stubPreview(response: object) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: true, json: () => Promise.resolve(response) }),
        );
    }

    it('does not render token counts before fetch resolves', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // Before fetch resolves there's no token-counts element yet.
        expect(screen.queryByTestId('token-counts')).not.toBeInTheDocument();
    });

    it('debounces preview fetch by 400ms and posts to the right URL', async function () {
        vi.useFakeTimers();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
        // Initial render kicks off a preview fetch — but only after the debounce.
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(410);
        expect(fetchMock).toHaveBeenCalledWith(
            '/threads/1/preview',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('renders token-counts + budget bar when fetch resolves', async function () {
        stubPreview({
            history: [],
            token_counts: { history: 100, prompt: 50, reserved: 0, total: 150 },
            budget: 1000,
            fits: true,
            over_by: 0,
            model: { id: 10, vendor: 'openai', name: 'gpt-4o', context_length: 1000 },
        });
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // Wait for the debounce + promise resolution.
        const counts = await screen.findByTestId('token-counts');
        expect(counts.textContent).toContain('150');
        expect(counts.textContent).toContain('1,000');
        expect(screen.getByTestId('budget-bar-fill')).toBeInTheDocument();
    });

    it('shows "approaching limit" between 80% and 100%', async function () {
        stubPreview({
            history: [],
            token_counts: { history: 0, prompt: 850, reserved: 0, total: 850 },
            budget: 1000,
            fits: true,
            over_by: 0,
            model: { id: 10, vendor: 'openai', name: 'gpt-4o', context_length: 1000 },
        });
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(await screen.findByTestId('near-budget')).toBeInTheDocument();
        expect(screen.queryByTestId('over-budget')).not.toBeInTheDocument();
    });

    it('shows "over budget" and disables submit when over context', async function () {
        stubPreview({
            history: [],
            token_counts: { history: 0, prompt: 2000, reserved: 0, total: 2000 },
            budget: 1000,
            fits: false,
            over_by: 1000,
            model: { id: 10, vendor: 'openai', name: 'gpt-4o', context_length: 1000 },
        });
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        await user.type(screen.getByTestId('prompt-textarea'), 'hello');
        expect(await screen.findByTestId('over-budget')).toBeInTheDocument();
        expect(screen.getByTestId('submit-prompt')).toBeDisabled();
    });

    it('renders the history preview only when history is non-empty', async function () {
        stubPreview({
            history: [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hi' },
                { role: 'assistant', content: 'Hello!' },
            ],
            token_counts: { history: 30, prompt: 5, reserved: 0, total: 35 },
            budget: 1000,
            fits: true,
            over_by: 0,
            model: { id: 10, vendor: 'openai', name: 'gpt-4o', context_length: 1000 },
        });
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(await screen.findByTestId('history-preview')).toBeInTheDocument();
        // Closed by default — body not shown.
        expect(screen.queryByTestId('history-preview-body')).not.toBeInTheDocument();
    });

    it('toggles the history preview body when clicked', async function () {
        stubPreview({
            history: [{ role: 'user', content: 'turn 1' }],
            token_counts: { history: 5, prompt: 5, reserved: 0, total: 10 },
            budget: 1000,
            fits: true,
            over_by: 0,
            model: { id: 10, vendor: 'openai', name: 'gpt-4o', context_length: 1000 },
        });
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const preview = await screen.findByTestId('history-preview');
        await user.click(within(preview).getByRole('button'));
        expect(screen.getByTestId('history-preview-body')).toBeInTheDocument();
        expect(within(preview).getByText('turn 1')).toBeInTheDocument();
    });

    it('omits the budget bar when the model has no recorded context_length', async function () {
        stubPreview({
            history: [],
            token_counts: { history: 0, prompt: 50, reserved: 0, total: 50 },
            budget: 0,
            fits: true,
            over_by: 0,
            model: { id: 10, vendor: 'openai', name: 'gpt-4o', context_length: null },
        });
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // Token-counts still render in the no-budget branch.
        const counts = await screen.findByTestId('token-counts');
        expect(counts.textContent).toContain('50');
        // But no fill bar.
        expect(screen.queryByTestId('budget-bar-fill')).not.toBeInTheDocument();
    });
});

describe('<ThreadShow /> — live stream pane (chunk 6b)', function () {
    it('renders the empty state when no active run exists', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // M8 chunk 1: Viz is the default; flip to Debug to assert on
        // LiveStreamPane DOM. The chunk-6b semantics are unchanged.
        fireEvent.click(screen.getByTestId('view-debug'));
        expect(screen.getByTestId('live-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('live-pane')).not.toBeInTheDocument();
        expect(subscribedToRunId).toHaveBeenCalledWith(null);
    });

    it('does not subscribe when the only runs are terminal', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, status: 'complete' }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('view-debug'));
        expect(screen.getByTestId('live-empty')).toBeInTheDocument();
        expect(subscribedToRunId).toHaveBeenCalledWith(null);
    });

    it('subscribes to the latest non-terminal run', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    { ...sampleRun, id: 50, sequence_in_thread: 1, status: 'complete' },
                    {
                        ...sampleRun,
                        id: 51,
                        sequence_in_thread: 2,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('view-debug'));
        expect(screen.getByTestId('live-pane')).toBeInTheDocument();
        expect(subscribedToRunId).toHaveBeenCalledWith(51);
    });

    it('renders streamed events from the hook', function () {
        mockStreamState.value = {
            events: [
                { event: 'run.started', payload: { run_id: 51 } },
                { event: 'token.received', payload: { run_id: 51, token: 'Hi', index: 0 } },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, id: 51, status: 'streaming', output_text: null }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('view-debug'));
        const pane = screen.getByTestId('live-events');
        expect(pane.textContent).toContain('"event": "run.started"');
        expect(pane.textContent).toContain('"event": "token.received"');
        expect(pane.textContent).toContain('"token": "Hi"');
    });

    it('shows the active transport in the pane header', function () {
        mockStreamState.value = {
            events: [],
            status: 'streaming',
            transport: 'sse',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, id: 51, status: 'streaming', output_text: null }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('view-debug'));
        expect(screen.getByTestId('live-transport').textContent).toContain('sse');
    });

    it('shows a notice when transport is unavailable', function () {
        mockStreamState.value = {
            events: [],
            status: 'idle',
            transport: 'none',
            disabled: true,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, id: 51, status: 'streaming', output_text: null }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('view-debug'));
        expect(screen.getByTestId('live-transport-unavailable')).toBeInTheDocument();
    });

    it('triggers router.reload({only: ["runs"]}) when the hook reports complete', async function () {
        vi.useFakeTimers();
        mockStreamState.value = {
            events: [],
            status: 'complete',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, id: 51, status: 'streaming', output_text: null }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        await vi.advanceTimersByTimeAsync(450);
        expect(routerReload).toHaveBeenCalledWith({ only: ['runs'] });
    });

    it('triggers router.reload when the hook reports errored', async function () {
        vi.useFakeTimers();
        mockStreamState.value = {
            events: [],
            status: 'errored',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, id: 51, status: 'streaming', output_text: null }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        await vi.advanceTimersByTimeAsync(450);
        expect(routerReload).toHaveBeenCalledWith({ only: ['runs'] });
    });
});

describe('<ThreadShow /> — model picker (chunk 7)', function () {
    const twoModels = [
        oneModel[0],
        {
            id: 11,
            vendor: 'anthropic',
            name: 'claude-3-opus',
            display_name: 'Claude 3 Opus',
            architecture_type: 'dense',
            position_encoding: 'rope',
            layers: 96,
            hidden_dim: 12288,
            attention_heads: 96,
            moe_experts: null,
            moe_active_experts: null,
            context_length: 200_000,
            pricing_input_per_million: 15.0,
            pricing_output_per_million: 75.0,
        },
        {
            id: 12,
            vendor: 'openai',
            name: 'gpt-moe',
            display_name: 'GPT-MoE',
            architecture_type: 'moe',
            position_encoding: 'rope',
            layers: 32,
            hidden_dim: 4096,
            attention_heads: 32,
            moe_experts: 8,
            moe_active_experts: 2,
            context_length: 32_000,
            pricing_input_per_million: 8.0,
            pricing_output_per_million: 24.0,
        },
    ];

    it('renders the metadata card for the initially-selected model', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('model-metadata-card');
        expect(within(card).getByText('GPT-4o')).toBeInTheDocument();
        expect(within(card).getByText('Dense')).toBeInTheDocument();
        // Pricing rendered as "$X.YZ / M"
        expect(within(card).getByText('$5.00 / M')).toBeInTheDocument();
        expect(within(card).getByText('$15.00 / M')).toBeInTheDocument();
    });

    it('renders MoE config in the metadata card for MoE models', function () {
        render(
            <ThreadShow
                thread={{ ...baseThread, default_model_id: 12 }}
                runs={[]}
                usable_models={twoModels}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('model-metadata-card');
        expect(within(card).getByText(/MoE.*8 experts.*2 active/)).toBeInTheDocument();
    });

    it('opens the picker popover on trigger click', async function () {
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={twoModels}
                has_api_keys={true}
            />,
        );
        // Popover content is portaled — not in the DOM until open.
        expect(screen.queryByPlaceholderText('Search models…')).not.toBeInTheDocument();
        await user.click(screen.getByTestId('model-select'));
        expect(screen.getByPlaceholderText('Search models…')).toBeInTheDocument();
    });

    it('shows the arch toggle + vendor chips in the picker filters', async function () {
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={twoModels}
                has_api_keys={true}
            />,
        );
        await user.click(screen.getByTestId('model-select'));
        expect(screen.getByTestId('arch-filter')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-chips')).toBeInTheDocument();
    });

    it('filters models when the MoE arch tab is selected', async function () {
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={twoModels}
                has_api_keys={true}
            />,
        );
        await user.click(screen.getByTestId('model-select'));
        // All 3 options visible initially.
        expect(screen.getByTestId('model-option-10')).toBeInTheDocument();
        expect(screen.getByTestId('model-option-11')).toBeInTheDocument();
        expect(screen.getByTestId('model-option-12')).toBeInTheDocument();

        // Click "MoE" arch tab — only the MoE option (id 12) should
        // remain in the list. The selected-model name still appears
        // in the trigger button + metadata card; we assert on testids
        // scoped to the dropdown options.
        await user.click(screen.getByRole('tab', { name: 'MoE' }));
        expect(screen.queryByTestId('model-option-10')).not.toBeInTheDocument();
        expect(screen.queryByTestId('model-option-11')).not.toBeInTheDocument();
        expect(screen.getByTestId('model-option-12')).toBeInTheDocument();
    });

    it('updates form.model_id when a model is selected', async function () {
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={twoModels}
                has_api_keys={true}
            />,
        );
        await user.click(screen.getByTestId('model-select'));
        await user.click(screen.getByTestId('model-option-11'));
        expect(setDataMock).toHaveBeenCalledWith('model_id', 11);
    });

    it('hides vendor chips when only one vendor is present', async function () {
        const user = userEvent.setup();
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        await user.click(screen.getByTestId('model-select'));
        expect(screen.queryByTestId('vendor-chips')).not.toBeInTheDocument();
    });
});

describe('<ThreadShow /> — right-pane viewer toggle (M8 chunk 1)', function () {
    // matchMedia is stubbed in test/setup.ts to return matches:false by
    // default (no reduced-motion). These tests temporarily reassign it
    // to simulate the user toggling the OS-level preference on.
    const realMatchMedia = window.matchMedia;
    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).matchMedia = realMatchMedia;
    });

    function stubReducedMotion(matches: boolean) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).matchMedia = (query: string) => ({
            matches,
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
        });
    }

    it('renders the Viz pane by default', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // The mocked VizPane stub shows up; the LiveStreamPane does not.
        expect(screen.getByTestId('viz-pane-stub')).toBeInTheDocument();
        expect(screen.queryByTestId('live-empty')).not.toBeInTheDocument();
        expect(screen.queryByTestId('live-pane')).not.toBeInTheDocument();
    });

    it('toggle has Viz selected initially', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('view-viz')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('view-debug')).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Debug swaps to the LiveStreamPane', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('view-debug'));
        expect(screen.getByTestId('live-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('viz-pane-stub')).not.toBeInTheDocument();
    });

    it('clicking Visualization swaps back to the Viz pane', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('view-debug'));
        fireEvent.click(screen.getByTestId('view-viz'));
        expect(screen.getByTestId('viz-pane-stub')).toBeInTheDocument();
    });

    it('prefers-reduced-motion forces the initial view to Debug', function () {
        stubReducedMotion(true);
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('view-debug')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('view-viz')).toBeDisabled();
        expect(screen.getByTestId('live-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('viz-pane-stub')).not.toBeInTheDocument();
    });

    it('forwards the lifted stream to whichever pane is visible', function () {
        mockStreamState.value = {
            events: [
                { event: 'run.started', payload: { run_id: 51 } },
                { event: 'token.received', payload: { run_id: 51, token: 'Hi', index: 0 } },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, id: 51, status: 'streaming', output_text: null }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // Viz pane sees the events (via the stub's text output).
        expect(screen.getByTestId('viz-pane-stub').textContent).toContain('streaming');
        expect(screen.getByTestId('viz-pane-stub').textContent).toContain('2 events');
    });

    it('lifts the useRunStream subscription up so only one subscription exists', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, id: 51, status: 'streaming', output_text: null }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // Both viz + debug share the same hook call — one subscription
        // total, regardless of which view is active.
        expect(subscribedToRunId).toHaveBeenCalledTimes(1);
        expect(subscribedToRunId).toHaveBeenCalledWith(51);
    });
});

describe('useReducedMotion (M8 chunk 1)', () => {
    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).matchMedia = (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
        });
    });

    it('returns the current value of the media query at mount', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).matchMedia = (query: string) => ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
        });

        const { useReducedMotion } = await import('@/hooks/useReducedMotion');
        const { renderHook } = await import('@testing-library/react');
        const { result } = renderHook(() => useReducedMotion());
        expect(result.current).toBe(true);
    });
});
