import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    routerGet,
    routerPost,
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
    routerPost: vi.fn(),
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
            post: routerPost,
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
    share_token: null,
    share_enabled_at: null,
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
    routerPost.mockReset();
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

    // ─── M11 chunk 3: Share toggle popover ──────────────────────────

    it('renders a Share button in the header (off state)', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('share-menu-trigger')).toBeInTheDocument();
        // Off state → no green indicator.
        expect(screen.queryByTestId('share-menu-on-indicator')).not.toBeInTheDocument();
    });

    it('renders the ON indicator when share_token is present', function () {
        render(
            <ThreadShow
                thread={{
                    ...baseThread,
                    share_token: 'a'.repeat(32),
                    share_enabled_at: '2026-05-19T00:00:00Z',
                }}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('share-menu-on-indicator')).toBeInTheDocument();
    });

    it('Enable button fires router.post to /threads/{id}/share', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('share-menu-trigger'));
        fireEvent.click(screen.getByTestId('share-menu-enable'));
        expect(routerPost).toHaveBeenCalledWith(
            `/threads/${baseThread.id}/share`,
            {},
            expect.objectContaining({ preserveScroll: true }),
        );
    });

    it('Disable button fires router.delete to /threads/{id}/share', function () {
        render(
            <ThreadShow
                thread={{
                    ...baseThread,
                    share_token: 'a'.repeat(32),
                    share_enabled_at: '2026-05-19T00:00:00Z',
                }}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        fireEvent.click(screen.getByTestId('share-menu-trigger'));
        fireEvent.click(screen.getByTestId('share-menu-disable'));
        expect(routerDelete).toHaveBeenCalledWith(
            `/threads/${baseThread.id}/share`,
            expect.objectContaining({ preserveScroll: true }),
        );
    });

    // ─── M9 chunk 5: thread Export button in header ─────────────────

    it('shows an Export button in the thread header pointing at /threads/{id}/export.json', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const exportBtn = screen.getByTestId('export-thread');
        // asChild renders Button as an <a>; href + download attrs are on it.
        const anchor = exportBtn.tagName === 'A' ? exportBtn : exportBtn.querySelector('a');
        expect(anchor).not.toBeNull();
        expect(anchor!.getAttribute('href')).toBe(`/threads/${baseThread.id}/export.json`);
        expect(anchor!.getAttribute('download')).toBe(`thread-${baseThread.id}.json`);
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

    // ─── M9 chunk 5: Download links + thread Export button ─────────

    it('shows the export download menu on terminal runs (M10 chunk 5)', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, status: 'complete' }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        // The wrapper testid stayed stable; the chooser button
        // (export-menu-trigger) replaced the M9-era single anchor.
        const wrap = screen.getByTestId(`download-link-${sampleRun.id}`);
        const trigger = wrap.querySelector('[data-testid="export-menu-trigger"]');
        expect(trigger).not.toBeNull();
    });

    it('does NOT show a Download link on streaming runs', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 52,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.queryByTestId('download-link-52')).not.toBeInTheDocument();
    });

    it('shows a Download link on errored runs (matches Replay placement)', function () {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[{ ...sampleRun, status: 'error', error_message: 'oops' }]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId(`download-link-${sampleRun.id}`)).toBeInTheDocument();
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
