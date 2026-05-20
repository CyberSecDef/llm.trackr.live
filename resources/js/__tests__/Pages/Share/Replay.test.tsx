import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/Components/Viz/VizPane', () => ({
    default: ({ events }: { events: Array<{ event: string }> }) =>
        React.createElement(
            'div',
            { 'data-testid': 'viz-pane-stub' },
            `viz: ${events.length} events`,
        ),
}));

vi.mock('@/Components/Viz/EmbeddingScene', () => ({
    default: ({ events }: { events: Array<{ event: string }> }) =>
        React.createElement(
            'div',
            { 'data-testid': 'embedding-scene-stub' },
            `emb: ${events.length} events`,
        ),
}));

vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();

    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
    };
});

import React from 'react';
import SharedReplay from '@/Pages/Share/Replay';
import type { RunEvent } from '@/types/runs';

const thread = { id: 1, title: 'Quantum' };
const baseRun = {
    id: 100,
    sequence_in_thread: 1,
    status: 'complete' as const,
    prompt: 'Hi',
    output_text: '4',
    error_message: null,
    input_tokens: 10,
    output_tokens: 1,
    duration_ms: 250,
    estimated_cost: 0.0001,
    created_at: '2026-05-19T00:00:00Z',
    total_layers: 80,
    architecture_type: 'dense' as const,
};
const baseModel = {
    display_name: 'GPT-4o',
    vendor: 'openai',
    architecture_type: 'dense' as const,
    context_length: 128000,
    pricing_input_per_million: 5.0,
    pricing_output_per_million: 15.0,
    moe_experts: null,
    moe_active_experts: null,
};
const events: RunEvent[] = [
    {
        event: 'run.started',
        payload: { run_id: 100, thread_id: 1, model_id: 10, started_at: '2026-05-19T00:00:00Z' },
    },
];

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('<SharedReplay />', () => {
    it('renders the header with thread title + run #', () => {
        render(
            <SharedReplay
                token="abc"
                thread={thread}
                run={baseRun}
                events={events}
                model={baseModel}
                prompts_redacted={false}
            />,
        );
        const header = screen.getByTestId('shared-replay-header');
        expect(header.textContent).toContain('Run #1');
        expect(header.textContent).toContain('Quantum');
        expect(header.textContent).toContain('GPT-4o');
    });

    it('starts paused at cursor 0 (no assistant text yet)', () => {
        render(
            <SharedReplay
                token="abc"
                thread={thread}
                run={baseRun}
                events={events}
                model={baseModel}
                prompts_redacted={false}
            />,
        );
        const text = screen.getByTestId('shared-replay-text');
        expect(text.textContent?.trim()).toBe('▍');
    });

    it('mounts the viz pane stub by default (Viz tab)', () => {
        render(
            <SharedReplay
                token="abc"
                thread={thread}
                run={baseRun}
                events={events}
                model={baseModel}
                prompts_redacted={false}
            />,
        );
        expect(screen.getByTestId('viz-pane-stub')).toBeInTheDocument();
    });

    it('Back link points to /share/{token}', () => {
        render(
            <SharedReplay
                token="abctoken"
                thread={thread}
                run={baseRun}
                events={events}
                model={baseModel}
                prompts_redacted={false}
            />,
        );
        const back = screen.getByText('Back to shared thread').closest('a');
        expect(back?.getAttribute('href')).toBe('/share/abctoken');
    });

    it('shows error badge for errored runs', () => {
        render(
            <SharedReplay
                token="abc"
                thread={thread}
                run={{ ...baseRun, status: 'error', error_message: 'oops' }}
                events={events}
                model={baseModel}
                prompts_redacted={false}
            />,
        );
        expect(screen.getByTestId('shared-replay-error-badge')).toBeInTheDocument();
    });

    it('footer links to the /about explainer + AGPL §13 source', () => {
        render(
            <SharedReplay
                token="abc"
                thread={thread}
                run={baseRun}
                events={events}
                model={baseModel}
                prompts_redacted={false}
            />,
        );
        expect(screen.getByTestId('shared-about-link').getAttribute('href')).toBe('/about');
        expect(screen.getByTestId('shared-source-link').getAttribute('href')).toBe(
            'https://github.com/CyberSecDef/llm.trackr.live',
        );
    });
});
