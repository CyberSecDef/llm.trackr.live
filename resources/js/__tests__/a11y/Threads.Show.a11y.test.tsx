import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '@/test/axe';

const { mockStreamState } = vi.hoisted(() => ({
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
    useRunStream: () => mockStreamState.value,
}));

vi.mock('@/Components/Viz/VizPane', () => ({
    default: () => React.createElement('div', { 'data-testid': 'viz-pane-stub' }),
}));

vi.mock('@/Components/Viz/EmbeddingScene', () => ({
    default: () => React.createElement('div', { 'data-testid': 'embedding-scene-stub' }),
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
                },
                patch: vi.fn(),
                post: vi.fn(),
                reset: vi.fn(),
            };
        },
        router: {
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
            reload: vi.fn(),
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
    tags: ['physics'],
    last_activity_at: null,
    created_at: '2026-05-18T00:00:00Z',
    default_model_id: null,
    share_token: null,
    share_enabled_at: null,
};

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
    mockStreamState.value = {
        events: [],
        status: 'idle',
        transport: 'websocket',
        disabled: false,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
});

describe('Threads/Show a11y', () => {
    it('has no axe violations on the empty (no runs) state', async () => {
        const { container } = render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });

    it('has no axe violations with a complete run + share enabled', async () => {
        const { container } = render(
            <ThreadShow
                thread={{
                    ...baseThread,
                    share_token: 'a'.repeat(32),
                    share_enabled_at: '2026-05-19T00:00:00Z',
                }}
                runs={[sampleRun]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });

    it('has no axe violations on the archived state', async () => {
        const { container } = render(
            <ThreadShow
                thread={{ ...baseThread, archived: true }}
                runs={[sampleRun]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });
});
