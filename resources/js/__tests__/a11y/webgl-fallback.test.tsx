import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * M12 chunk 8 — verifies the WebGL-2-unsupported path on the 3 viz
 * pages: Threads/Show, Runs/Replay, Share/Replay. Each page's
 * tablist gates the Viz + Embeddings tabs on WebGL2 availability;
 * when it's missing, both tabs are disabled, the page defaults to
 * Debug, and a notice explains the situation.
 *
 * setup.ts defaults useWebGL2Support to true. This file flips that
 * mock to return false so the gate path fires.
 */

vi.mock('@/hooks/useWebGL2Support', () => ({
    useWebGL2Support: () => false,
}));

const { mockSubscribedToRunId } = vi.hoisted(() => ({
    mockSubscribedToRunId: vi.fn(),
}));

vi.mock('@/hooks/useRunStream', () => ({
    useRunStream: (runId: number | null) => {
        mockSubscribedToRunId(runId);
        return {
            events: [],
            status: 'idle' as const,
            transport: 'websocket' as const,
            disabled: false,
        };
    },
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
        router: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), reload: vi.fn() },
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
    title: 'Quantum',
    archived: false,
    tags: [],
    last_activity_at: null,
    created_at: '2026-05-19T00:00:00Z',
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
});

describe('Threads/Show WebGL2-unsupported fallback', () => {
    it('shows the webgl-unsupported notice', () => {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.getByTestId('webgl-unsupported-notice')).toBeInTheDocument();
    });

    it('disables the Visualization tab', () => {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const viz = screen.getByTestId('view-viz');
        expect(viz).toBeDisabled();
        expect(viz.getAttribute('title')).toMatch(/WebGL 2\.0/);
    });

    it('disables the Embeddings tab', () => {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const emb = screen.getByTestId('view-embeddings');
        expect(emb).toBeDisabled();
        expect(emb.getAttribute('title')).toMatch(/WebGL 2\.0/);
    });

    it('defaults to the Debug tab (no viz / embedding stubs mounted)', () => {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        expect(screen.queryByTestId('viz-pane-stub')).not.toBeInTheDocument();
        expect(screen.queryByTestId('embedding-scene-stub')).not.toBeInTheDocument();
    });
});
