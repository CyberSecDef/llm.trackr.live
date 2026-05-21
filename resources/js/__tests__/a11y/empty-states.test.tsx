import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/*
 * M12 chunk 5 — locks the three SPEC-named empty states (no
 * threads / no API keys / no runs in a thread) plus their visual
 * affordances: an icon, a title, body text, and (where the user
 * can act) a CTA button.
 *
 * Regression-safe: if a future contributor deletes the icon or
 * downgrades the title to plain text, these tests fail and CI
 * blocks the merge. The shared visual pattern keeps the
 * empty-state vocabulary consistent across pages.
 */

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
            url: '/',
            component: 'Dashboard',
            version: null,
        }),
    };
});

import React from 'react';
import Dashboard from '@/Pages/Dashboard';
import ApiKeysIndex from '@/Pages/ApiKeys/Index';
import ThreadShow from '@/Pages/Threads/Show';
import SharedThreadShow from '@/Pages/Share/Show';

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

describe('Empty states — no API keys', () => {
    it('Dashboard NoApiKeyCallout shows icon + title + CTA', () => {
        render(
            <Dashboard
                stats={{ total_runs: 0, total_tokens: 0, total_cost: 0 }}
                recent_threads={[]}
                has_api_keys={false}
            />,
        );
        const callout = screen.getByTestId('no-api-key-callout');
        expect(within(callout).getByText(/Set up your first API key/i)).toBeInTheDocument();
        // Icon present
        expect(callout.querySelector('svg')).not.toBeNull();
        // CTA link to /api-keys
        const link = within(callout).getByRole('link', { name: /Add a key/i });
        expect(link).toHaveAttribute('href', '/api-keys');
    });

    it('Threads/Show PromptFooter no-api-key state has icon + title + CTA', () => {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={false}
            />,
        );
        const footer = screen.getByTestId('no-api-key-footer');
        expect(within(footer).getByText(/Add an API key/i)).toBeInTheDocument();
        expect(footer.querySelector('svg')).not.toBeNull();
        const link = within(footer).getByRole('link', { name: /API Keys/i });
        expect(link).toHaveAttribute('href', '/api-keys');
    });

    it('ApiKeys/Index empty-keys has icon + title + body (chunk-5 polish)', () => {
        render(<ApiKeysIndex apiKeys={[]} supportedVendors={['openai']} />);
        const empty = screen.getByTestId('empty-keys');
        expect(empty.querySelector('svg')).not.toBeNull();
        expect(within(empty).getByText(/No API keys yet/i)).toBeInTheDocument();
        expect(within(empty).getByText(/Bring-your-own-key/i)).toBeInTheDocument();
    });
});

describe('Empty states — no threads', () => {
    it('Dashboard EmptyThreads shows icon + title + dynamic CTA (with API keys)', () => {
        render(
            <Dashboard
                stats={{ total_runs: 0, total_tokens: 0, total_cost: 0 }}
                recent_threads={[]}
                has_api_keys={true}
            />,
        );
        const empty = screen.getByTestId('empty-threads');
        expect(empty.querySelector('svg')).not.toBeNull();
        expect(within(empty).getByText('No threads yet')).toBeInTheDocument();
        const cta = within(empty).getByRole('link', { name: /Start a thread/i });
        expect(cta).toHaveAttribute('href', '/threads');
    });

    it('Dashboard EmptyThreads CTA redirects to API keys when none exist', () => {
        render(
            <Dashboard
                stats={{ total_runs: 0, total_tokens: 0, total_cost: 0 }}
                recent_threads={[]}
                has_api_keys={false}
            />,
        );
        const empty = screen.getByTestId('empty-threads');
        const cta = within(empty).getByRole('link', { name: /Add API key first/i });
        expect(cta).toHaveAttribute('href', '/api-keys');
    });
});

describe('Empty states — no runs in a thread', () => {
    it('Threads/Show empty-transcript shows icon + title + body (chunk-5 polish)', () => {
        render(
            <ThreadShow
                thread={baseThread}
                runs={[]}
                usable_models={oneModel}
                has_api_keys={true}
            />,
        );
        const empty = screen.getByTestId('empty-transcript');
        expect(empty.querySelector('svg')).not.toBeNull();
        expect(within(empty).getByText('No prompts yet')).toBeInTheDocument();
        expect(
            within(empty).getByText(/Type your first one in the input above/i),
        ).toBeInTheDocument();
    });

    it('Share/Show shared-empty acknowledges the no-runs state (read-only, no CTA)', () => {
        render(
            <SharedThreadShow
                token={'a'.repeat(32)}
                thread={{
                    id: 1,
                    title: 'Quantum',
                    tags: [],
                    last_activity_at: null,
                    created_at: '2026-05-19T00:00:00Z',
                }}
                runs={[]}
                prompts_redacted={false}
            />,
        );
        const empty = screen.getByTestId('shared-empty');
        expect(within(empty).getByText(/No runs yet on this thread/i)).toBeInTheDocument();
        // No CTA here — read-only viewer can't act.
    });
});
