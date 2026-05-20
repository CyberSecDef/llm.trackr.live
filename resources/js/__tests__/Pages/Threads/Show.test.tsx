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

// M8 chunk 7: same treatment for EmbeddingScene — jsdom can't run the
// custom ShaderMaterial / Points pipeline. Stub renders a div so the
// tab-toggle integration is observable.
vi.mock('@/Components/Viz/EmbeddingScene', () => ({
    default: ({ events, status }: { events: Array<{ event: string }>; status: string }) =>
        React.createElement(
            'div',
            { 'data-testid': 'embedding-scene-stub' },
            `emb: ${status}, ${events.length} events`,
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
    total_layers: null,
    architecture_type: null,
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

    // ─── M8 chunk 4: LiveRunBody ──────────────────────────────────
    // For pending/streaming rows, the Assistant block is fed by
    // computeStreamMetrics(events) rather than the row's static
    // output_text. The metrics strip shows TPS · cost · context bar.

    it('renders LiveRunBody (cursor + live text from events) on a streaming run', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'run.started',
                    payload: { run_id: 51, started_at: '2026-05-19T00:00:00Z' },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'Hello',
                        index: 0,
                        t_ms: 200,
                        logprobs: null,
                        is_final: false,
                    },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: ' world',
                        index: 1,
                        t_ms: 400,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                        input_tokens: 100,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('run-51');
        const live = within(card).getByTestId('live-assistant-text');
        expect(live.textContent).toContain('Hello world');
        expect(within(card).getByTestId('live-cursor')).toBeInTheDocument();
        // Static run renderers should NOT be visible.
        expect(within(card).queryByText(/10 in · 1 out/)).not.toBeInTheDocument();
    });

    it('shows TPS · cost · context bar on a streaming run with model + pricing', function () {
        // 2 tokens at t_ms 1000 → cumulative TPS = 2 tok/s.
        // input=100 @ $5/M = $0.0005; output=2 @ $15/M = $0.00003.
        // context_used = 102 / 128000 ≈ 0.08% → bar visible but tiny.
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'A',
                        index: 0,
                        t_ms: 500,
                        logprobs: null,
                        is_final: false,
                    },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'B',
                        index: 1,
                        t_ms: 1000,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                        input_tokens: 100,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const numbers = screen.getByTestId('live-numbers');
        expect(numbers.textContent).toMatch(/2 out/);
        expect(numbers.textContent).toMatch(/2\.0 t\/s/);
        expect(numbers.textContent).toMatch(/\$0\.0005/);
        expect(screen.getByTestId('live-context-bar')).toBeInTheDocument();
        expect(screen.getByTestId('live-context-bar-fill')).toBeInTheDocument();
    });

    it('hides the context bar when the model has no context_length', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'x',
                        index: 0,
                        t_ms: 100,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        const modelNoContext = [{ ...oneModel[0], context_length: null }];
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                        input_tokens: 0,
                    },
                ]}
                usable_models={modelNoContext}
                has_api_keys={true}
            />,
        );
        expect(screen.queryByTestId('live-context-bar')).not.toBeInTheDocument();
        // Numbers strip still renders.
        expect(screen.getByTestId('live-numbers')).toBeInTheDocument();
    });

    it('omits the cost segment when pricing is missing', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'x',
                        index: 0,
                        t_ms: 100,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        const modelNoPricing = [
            {
                ...oneModel[0],
                pricing_input_per_million: null,
                pricing_output_per_million: null,
            },
        ];
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                        input_tokens: 0,
                    },
                ]}
                usable_models={modelNoPricing}
                has_api_keys={true}
            />,
        );
        const numbers = screen.getByTestId('live-numbers');
        expect(numbers.textContent).not.toMatch(/\$/);
    });

    it('shows an empty cursor + 0 tokens when no events have arrived yet', function () {
        mockStreamState.value = {
            events: [],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                        input_tokens: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('run-51');
        expect(within(card).getByTestId('live-cursor')).toBeInTheDocument();
        expect(within(card).getByTestId('live-numbers').textContent).toMatch(/0 out/);
        expect(within(card).getByTestId('live-numbers').textContent).toMatch(/— t\/s/);
    });

    // ─── M8 chunk 5b: LogitsDistribution wired into LiveRunBody ────

    it('renders LogitsDistribution inside an active run row when logprobs are present', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'Paris',
                        index: 0,
                        t_ms: 200,
                        logprobs: [
                            { token: 'Paris', logprob: Math.log(0.7) },
                            { token: 'the', logprob: Math.log(0.2) },
                            { token: 'located', logprob: Math.log(0.1) },
                        ],
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('run-51');
        expect(within(card).getByTestId('logits-distribution')).toBeInTheDocument();
        // Chosen token bar comes first (highest prob, descending order).
        const firstRow = within(card).getByTestId('logit-row-0');
        expect(firstRow.getAttribute('data-chosen')).toBe('true');
    });

    it('omits LogitsDistribution when no token has logprobs', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'Hi',
                        index: 0,
                        t_ms: 100,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('run-51');
        expect(within(card).queryByTestId('logits-distribution')).not.toBeInTheDocument();
    });

    // ─── M8 chunk 6: MoERouting wired into LiveRunBody ─────────────

    it('mounts MoERouting on a streaming MoE run', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'moe.routed',
                    payload: { run_id: 51, token_index: 0, experts: [0, 3], scores: [0.7, 0.3] },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        const moeModel = [
            {
                ...oneModel[0],
                architecture_type: 'moe',
                moe_experts: 8,
                moe_active_experts: 2,
            },
        ];
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={moeModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('run-51');
        expect(within(card).getByTestId('moe-routing')).toBeInTheDocument();
        expect(within(card).getByTestId('moe-router-bars')).toBeInTheDocument();
        expect(within(card).getByTestId('moe-utilization-bars')).toBeInTheDocument();
    });

    it('does not mount MoERouting on a dense (non-MoE) run', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'moe.routed',
                    payload: { run_id: 51, token_index: 0, experts: [0, 3], scores: [0.7, 0.3] },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        // oneModel has architecture_type: 'dense' — the gating clause
        // should skip the component even if MoE events arrive.
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('run-51');
        expect(within(card).queryByTestId('moe-routing')).not.toBeInTheDocument();
    });

    it('keeps StaticRunBody for a completed run even with events present', function () {
        // Event stream is non-empty (could happen briefly between
        // run.completed and the 400ms terminal-reload), but the row
        // is `complete` so the static body owns the render.
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 100,
                        token: 'noise',
                        index: 0,
                        t_ms: 100,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'complete',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[sampleRun]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const card = screen.getByTestId('run-100');
        expect(within(card).queryByTestId('live-cursor')).not.toBeInTheDocument();
        expect(within(card).queryByTestId('live-metrics')).not.toBeInTheDocument();
        expect(within(card).getByText('4')).toBeInTheDocument(); // static output_text
        expect(within(card).getByText(/10 in · 1 out/)).toBeInTheDocument();
    });

    // ─── M9 chunk 1: Replay link on terminal runs ──────────────────

    it('shows a Replay link on completed runs pointing at the right URL', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, status: 'complete' }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const link = screen.getByTestId(`replay-link-${sampleRun.id}`);
        expect(link).toBeInTheDocument();
        expect(link.getAttribute('href')).toBe(
            `/threads/${baseThread.id}/runs/${sampleRun.id}/replay`,
        );
    });

    it('shows a Replay link on errored runs (partial output is still replayable)', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        status: 'error',
                        error_message: 'oops',
                        output_text: 'partial',
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId(`replay-link-${sampleRun.id}`)).toBeInTheDocument();
    });

    it('does NOT show a Replay link on streaming runs', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.queryByTestId('replay-link-51')).not.toBeInTheDocument();
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

    // ─── M8 chunk 7: Embeddings tab ────────────────────────────────

    it('exposes an Embeddings tab in the toggle', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('view-embeddings')).toBeInTheDocument();
        // Defaults to Viz, not Embeddings.
        expect(screen.getByTestId('view-embeddings')).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Embeddings mounts the EmbeddingScene', async function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('view-embeddings'));
        // Lazy import resolves asynchronously — findByTestId waits.
        await screen.findByTestId('embedding-scene-stub');
        expect(screen.queryByTestId('viz-pane-stub')).not.toBeInTheDocument();
        expect(screen.queryByTestId('live-pane')).not.toBeInTheDocument();
    });

    it('Embeddings tab remains available under reduced-motion (only Viz is disabled)', async function () {
        stubReducedMotion(true);
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // Embeddings is not disabled — user can switch to it manually.
        expect(screen.getByTestId('view-embeddings')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('view-embeddings'));
        await screen.findByTestId('embedding-scene-stub');
    });

    // ─── M8 chunk 8: PlaybackControls ──────────────────────────────

    it('renders PlaybackControls above the right-pane toggle', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('playback-controls')).toBeInTheDocument();
        // Default state: playing, 1×, LIVE pill visible.
        expect(screen.getByTestId('playback-live-pill')).toBeInTheDocument();
        expect(screen.getByTestId('playback-speed-1')).toHaveAttribute('aria-pressed', 'true');
    });

    it('pausing freezes the viz event count (live text stops updating)', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'A',
                        index: 0,
                        t_ms: 100,
                        logprobs: null,
                        is_final: false,
                    },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'B',
                        index: 1,
                        t_ms: 200,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // Initially LIVE — visibleEvents is the full array.
        expect(screen.getByTestId('viz-pane-stub').textContent).toContain('2 events');

        // Pause → LIVE pill disappears, cursor/total counter appears.
        fireEvent.click(screen.getByTestId('playback-toggle'));
        expect(screen.queryByTestId('playback-live-pill')).not.toBeInTheDocument();
        expect(screen.getByTestId('playback-cursor-jump')).toBeInTheDocument();
    });

    it('clicking a speed button updates the segmented control state', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('playback-speed-2'));
        expect(screen.getByTestId('playback-speed-2')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('playback-speed-1')).toHaveAttribute('aria-pressed', 'false');
        // No longer LIVE because speed !== 1.
        expect(screen.queryByTestId('playback-live-pill')).not.toBeInTheDocument();
    });

    it('jump-to-live (clicking the cursor counter) returns to LIVE at 1×', function () {
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'A',
                        index: 0,
                        t_ms: 100,
                        logprobs: null,
                        is_final: false,
                    },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 51,
                        token: 'B',
                        index: 1,
                        t_ms: 200,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 51,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('playback-toggle')); // pause
        fireEvent.click(screen.getByTestId('playback-cursor-jump')); // resume + live
        expect(screen.getByTestId('playback-live-pill')).toBeInTheDocument();
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

// ─── M8 chunk 9: vertical-slice kitchen-sink integration test ────
//
// One realistic mixed event stream exercises every viz piece
// simultaneously: live text + cursor, metrics strip, logits chart,
// MoE routing, transformer stack stub, embeddings tab availability,
// and the playback controls. Catches the kind of integration
// regression that unit tests miss.
//
describe('<ThreadShow /> — M8 vertical slice (chunk 9)', function () {
    it('a realistic MoE event sequence drives every viz piece simultaneously', function () {
        // Mixtral-shaped model: MoE with 8 experts, top-2 active, pricing
        // + context_length so the metrics strip has all four fields.
        const mixtralModel = [
            {
                ...oneModel[0],
                id: 99,
                vendor: 'together',
                name: 'mixtral-8x7b',
                display_name: 'Mixtral 8x7B',
                architecture_type: 'moe',
                moe_experts: 8,
                moe_active_experts: 2,
                layers: 32,
                context_length: 32000,
                pricing_input_per_million: 0.6,
                pricing_output_per_million: 0.6,
            },
        ];

        // Mixed event sequence: started + 3 tokens (with logprobs)
        // interspersed with layer.advanced + moe.routed. Each token
        // gets its own layer.advanced and moe.routed event so all the
        // per-token signals fire.
        mockStreamState.value = {
            events: [
                {
                    event: 'run.started',
                    payload: {
                        run_id: 77,
                        thread_id: 1,
                        model_id: 99,
                        started_at: '2026-05-19T00:00:00Z',
                    },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 77,
                        token: 'The',
                        index: 0,
                        t_ms: 100,
                        logprobs: [
                            { token: 'The', logprob: Math.log(0.6) },
                            { token: 'A', logprob: Math.log(0.25) },
                            { token: 'In', logprob: Math.log(0.15) },
                        ],
                        is_final: false,
                    },
                },
                {
                    event: 'layer.advanced',
                    payload: { run_id: 77, token_index: 0, total_layers: 32 },
                },
                {
                    event: 'moe.routed',
                    payload: { run_id: 77, token_index: 0, experts: [0, 3], scores: [0.7, 0.3] },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 77,
                        token: ' answer',
                        index: 1,
                        t_ms: 200,
                        logprobs: [
                            { token: ' answer', logprob: Math.log(0.7) },
                            { token: ' result', logprob: Math.log(0.2) },
                            { token: ' value', logprob: Math.log(0.1) },
                        ],
                        is_final: false,
                    },
                },
                {
                    event: 'layer.advanced',
                    payload: { run_id: 77, token_index: 1, total_layers: 32 },
                },
                {
                    event: 'moe.routed',
                    payload: { run_id: 77, token_index: 1, experts: [3, 7], scores: [0.55, 0.45] },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 77,
                        token: ' is',
                        index: 2,
                        t_ms: 300,
                        logprobs: [
                            { token: ' is', logprob: Math.log(0.8) },
                            { token: ' was', logprob: Math.log(0.15) },
                            { token: ' will', logprob: Math.log(0.05) },
                        ],
                        is_final: false,
                    },
                },
                {
                    event: 'layer.advanced',
                    payload: { run_id: 77, token_index: 2, total_layers: 32 },
                },
                {
                    event: 'moe.routed',
                    payload: { run_id: 77, token_index: 2, experts: [3, 0], scores: [0.6, 0.4] },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };

        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 77,
                        model_id: 99,
                        status: 'streaming',
                        output_text: null,
                        input_tokens: 50,
                        total_layers: 32,
                        architecture_type: 'moe',
                    },
                ]}
                usable_models={mixtralModel}
                has_api_keys={true}
            />,
        );

        const card = screen.getByTestId('run-77');

        // ── Live text + cursor (chunk 4) ──────────────────────────
        const liveText = within(card).getByTestId('live-assistant-text');
        expect(liveText.textContent).toContain('The answer is');
        expect(within(card).getByTestId('live-cursor')).toBeInTheDocument();

        // ── Metrics strip (chunk 4) ───────────────────────────────
        const numbers = within(card).getByTestId('live-numbers');
        expect(numbers.textContent).toMatch(/3 out/);
        // 3 tokens at t_ms 300 → 10 t/s cumulative.
        expect(numbers.textContent).toMatch(/10\.0 t\/s/);
        // Cost: (50 + 3) tokens × $0.60/M ≈ $0.0000318.
        expect(numbers.textContent).toMatch(/\$0\.0000/);
        // Context bar visible (input 50 + output 3 = 53 / 32000).
        expect(within(card).getByTestId('live-context-bar')).toBeInTheDocument();

        // ── Logits chart (chunk 5b) ───────────────────────────────
        const logits = within(card).getByTestId('logits-distribution');
        expect(logits).toBeInTheDocument();
        // Latest token's chosen alternative is ' is' (prob 0.8 wins).
        expect(logits.textContent).toContain('" is"');

        // ── MoE routing (chunk 6) — MoE-only, must be present ─────
        expect(within(card).getByTestId('moe-routing')).toBeInTheDocument();
        // Header reads 8 experts · top-2.
        expect(within(card).getByTestId('moe-routing-header').textContent).toContain('8 experts');
        // Cumulative utilization: expert 3 was activated three times.
        expect(within(card).getByTestId('moe-util-bar-3').getAttribute('data-count')).toBe('3');
        // Expert 0 activated twice, expert 7 once.
        expect(within(card).getByTestId('moe-util-bar-0').getAttribute('data-count')).toBe('2');
        expect(within(card).getByTestId('moe-util-bar-7').getAttribute('data-count')).toBe('1');

        // ── Viz pane receives all 10 events ───────────────────────
        // (1 run.started + 3 tokens + 3 layer.advanced + 3 moe.routed)
        expect(screen.getByTestId('viz-pane-stub').textContent).toContain('10 events');

        // ── Playback controls (chunk 8) — LIVE at start ───────────
        expect(screen.getByTestId('playback-live-pill')).toBeInTheDocument();
        // Pause should drop LIVE pill and show cursor counter.
        fireEvent.click(screen.getByTestId('playback-toggle'));
        expect(screen.queryByTestId('playback-live-pill')).not.toBeInTheDocument();
        expect(screen.getByTestId('playback-cursor-jump').textContent).toContain('10/10');

        // ── Embeddings tab is present and switchable ──────────────
        expect(screen.getByTestId('view-embeddings')).toBeInTheDocument();

        // ── Subscription went to the right run id ─────────────────
        expect(subscribedToRunId).toHaveBeenCalledWith(77);
    });

    it('pausing then stepping advances the visible event count one token at a time', function () {
        // Same kind of mixed stream, but rendered behind a pause so
        // we can verify Step actually skips intermediate non-token
        // events and lands on the next token.received per chunk-8.
        mockStreamState.value = {
            events: [
                {
                    event: 'token.received',
                    payload: {
                        run_id: 77,
                        token: 'A',
                        index: 0,
                        t_ms: 100,
                        logprobs: null,
                        is_final: false,
                    },
                },
                {
                    event: 'layer.advanced',
                    payload: { run_id: 77, token_index: 0, total_layers: 12 },
                },
                {
                    event: 'layer.advanced',
                    payload: { run_id: 77, token_index: 0, total_layers: 12 },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 77,
                        token: 'B',
                        index: 1,
                        t_ms: 200,
                        logprobs: null,
                        is_final: false,
                    },
                },
                {
                    event: 'token.received',
                    payload: {
                        run_id: 77,
                        token: 'C',
                        index: 2,
                        t_ms: 300,
                        logprobs: null,
                        is_final: false,
                    },
                },
            ],
            status: 'streaming',
            transport: 'websocket',
            disabled: false,
        };

        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 77,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );

        // LIVE → pause → cursor sits at the end.
        fireEvent.click(screen.getByTestId('playback-toggle'));
        expect(screen.getByTestId('playback-cursor-jump').textContent).toContain('5/5');
        // Stepping at the head is a no-op (button disabled).
        expect(screen.getByTestId('playback-step')).toBeDisabled();
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
