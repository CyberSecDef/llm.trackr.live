import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the lazy-loaded viz panes (no WebGL in jsdom).
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
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Alice', email: 'a@example.com', role: 'user' } },
                errors: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/threads/1/runs/100/replay',
            component: 'Runs/Replay',
            version: null,
        }),
    };
});

import React from 'react';
import Replay from '@/Pages/Runs/Replay';
import type { RunEvent } from '@/types/runs';

const thread = { id: 1, title: 'Quantum entanglement' };

const baseRun = {
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
    created_at: '2026-05-19T00:00:00Z',
    total_layers: 80,
    architecture_type: 'dense' as const,
};

const baseModel = {
    id: 10,
    vendor: 'openai',
    name: 'gpt-4o',
    display_name: 'GPT-4o',
    architecture_type: 'dense' as const,
    context_length: 128000,
    pricing_input_per_million: 5.0,
    pricing_output_per_million: 15.0,
    moe_experts: null,
    moe_active_experts: null,
};

function tokenEvent(token: string, index: number, tMs: number): RunEvent {
    return {
        event: 'token.received',
        payload: {
            run_id: 100,
            token,
            index,
            t_ms: tMs,
            logprobs: null,
            is_final: false,
        },
    };
}

const events: RunEvent[] = [
    {
        event: 'run.started',
        payload: {
            run_id: 100,
            thread_id: 1,
            model_id: 10,
            started_at: '2026-05-19T00:00:00Z',
        },
    },
    tokenEvent('4', 0, 100),
    {
        event: 'run.completed',
        payload: {
            run_id: 100,
            input_tokens: 10,
            output_tokens: 1,
            duration_ms: 250,
            tokens_per_second: 4.0,
            estimated_cost: 0.0001,
        },
    },
];

describe('<Replay />', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the header with thread title + run # + model name', () => {
        render(<Replay thread={thread} run={baseRun} events={events} model={baseModel} />);
        const header = screen.getByTestId('replay-header');
        expect(header.textContent).toContain('Run #1');
        expect(header.textContent).toContain('GPT-4o');
        expect(header.textContent).toContain('Quantum entanglement');
    });

    it('starts paused at cursor 0 (assistant body empty + cursor visible)', () => {
        render(<Replay thread={thread} run={baseRun} events={events} model={baseModel} />);
        // Assistant text starts empty (no events consumed yet).
        const assistant = screen.getByTestId('replay-assistant-text');
        expect(assistant.textContent?.trim()).toBe('▍');
        // Pause button (icon is Play because we're paused).
        const toggle = screen.getByTestId('playback-toggle');
        expect(toggle.getAttribute('data-playing')).toBe('false');
    });

    it('renders the prompt statically', () => {
        render(<Replay thread={thread} run={baseRun} events={events} model={baseModel} />);
        expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
    });

    it('shows replay-pane viz tab by default (no debug, no embeddings)', () => {
        render(<Replay thread={thread} run={baseRun} events={events} model={baseModel} />);
        expect(screen.getByTestId('viz-pane-stub')).toBeInTheDocument();
        expect(screen.queryByTestId('embedding-scene-stub')).not.toBeInTheDocument();
        expect(screen.queryByTestId('replay-debug-pane')).not.toBeInTheDocument();
    });

    it('the Debug tab shows the replay event JSON dump', () => {
        render(<Replay thread={thread} run={baseRun} events={events} model={baseModel} />);
        fireEvent.click(screen.getByTestId('view-debug'));
        expect(screen.getByTestId('replay-debug-pane')).toBeInTheDocument();
        // Initially paused with 0 visible events → placeholder text.
        expect(screen.getByTestId('replay-events').textContent).toContain('click play to begin');
    });

    it('shows the error badge + message when status is "error"', () => {
        render(
            <Replay
                thread={thread}
                run={{ ...baseRun, status: 'error', error_message: 'Vendor rate-limited' }}
                events={events}
                model={baseModel}
            />,
        );
        expect(screen.getByTestId('replay-error-badge')).toBeInTheDocument();
        expect(screen.getByText('Vendor rate-limited')).toBeInTheDocument();
    });

    it('shows the duration of the original run in the metrics footer', () => {
        render(<Replay thread={thread} run={baseRun} events={events} model={baseModel} />);
        const numbers = screen.getByTestId('replay-numbers');
        expect(numbers.textContent).toContain('original: 250ms');
    });

    it('back link points to the thread detail', () => {
        render(<Replay thread={thread} run={baseRun} events={events} model={baseModel} />);
        const back = screen.getByText('Back to thread').closest('a');
        expect(back?.getAttribute('href')).toBe('/threads/1');
    });
});
