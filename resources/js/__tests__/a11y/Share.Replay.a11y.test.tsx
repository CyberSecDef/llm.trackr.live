import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '@/test/axe';

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
    };
});

import React from 'react';
import SharedReplay from '@/Pages/Share/Replay';
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
    created_at: '2026-05-18T00:00:00Z',
    total_layers: 32,
    architecture_type: 'dense',
};

const baseModel = {
    display_name: 'GPT-4o',
    vendor: 'openai',
    architecture_type: 'dense',
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
    {
        event: 'token.received',
        payload: {
            run_id: 100,
            token: '4',
            index: 0,
            t_ms: 100,
            logprobs: null,
            is_final: false,
        },
    },
];

describe('Share/Replay a11y', () => {
    it('has no axe violations on a complete-run replay', async () => {
        const { container } = render(
            <SharedReplay
                token={'a'.repeat(32)}
                thread={thread}
                run={baseRun}
                events={events}
                model={baseModel}
                prompts_redacted={false}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });

    it('has no axe violations on an errored-run replay', async () => {
        const { container } = render(
            <SharedReplay
                token={'a'.repeat(32)}
                thread={thread}
                run={{ ...baseRun, status: 'error', error_message: 'rate limit exceeded' }}
                events={events}
                model={baseModel}
                prompts_redacted={false}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });

    it('has no axe violations with prompts redacted', async () => {
        const { container } = render(
            <SharedReplay
                token={'a'.repeat(32)}
                thread={thread}
                run={{ ...baseRun, prompt: null }}
                events={events}
                model={baseModel}
                prompts_redacted={true}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });
});
