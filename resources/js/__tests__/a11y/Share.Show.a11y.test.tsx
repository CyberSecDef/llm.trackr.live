import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '@/test/axe';

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
import SharedThreadShow from '@/Pages/Share/Show';

const baseThread = {
    id: 1,
    title: 'Quantum entanglement',
    tags: ['physics', 'public'],
    last_activity_at: '2026-05-19T00:00:00Z',
    created_at: '2026-05-18T00:00:00Z',
};

const completeRun = {
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
    total_layers: null,
    architecture_type: null,
};

const erroredRun = {
    ...completeRun,
    id: 101,
    sequence_in_thread: 2,
    status: 'error' as const,
    output_text: null,
    error_message: 'rate limit exceeded',
};

describe('Share/Show a11y', () => {
    it('has no axe violations on the empty thread state', async () => {
        const { container } = render(
            <SharedThreadShow
                token={'a'.repeat(32)}
                thread={baseThread}
                runs={[]}
                prompts_redacted={false}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });

    it('has no axe violations with a mix of complete + errored runs', async () => {
        const { container } = render(
            <SharedThreadShow
                token={'a'.repeat(32)}
                thread={baseThread}
                runs={[completeRun, erroredRun]}
                prompts_redacted={false}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });

    it('has no axe violations with prompts redacted', async () => {
        const { container } = render(
            <SharedThreadShow
                token={'a'.repeat(32)}
                thread={baseThread}
                runs={[{ ...completeRun, prompt: null }]}
                prompts_redacted={true}
            />,
        );
        const results = await runAxe(container);
        expect(results).toHaveNoViolations();
    });
});
