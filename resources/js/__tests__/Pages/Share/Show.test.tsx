import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    tags: ['research'],
    last_activity_at: '2026-05-19T00:00:00Z',
    created_at: '2026-05-18T00:00:00Z',
};

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
    created_at: '2026-05-18T00:00:00Z',
    total_layers: 80,
    architecture_type: 'dense',
};

describe('<SharedThreadShow />', () => {
    it('renders the thread title in the header', () => {
        render(
            <SharedThreadShow token="abc" thread={baseThread} runs={[]} prompts_redacted={false} />,
        );
        expect(screen.getByText('Quantum entanglement')).toBeInTheDocument();
    });

    it('renders "Anonymous view" notice', () => {
        render(
            <SharedThreadShow token="abc" thread={baseThread} runs={[]} prompts_redacted={false} />,
        );
        const header = screen.getByTestId('shared-header');
        expect(header.textContent).toContain('Anonymous view');
    });

    it('shows the redaction notice when prompts_redacted=true', () => {
        render(
            <SharedThreadShow token="abc" thread={baseThread} runs={[]} prompts_redacted={true} />,
        );
        expect(screen.getByTestId('shared-redaction-notice')).toBeInTheDocument();
    });

    it('hides the redaction notice when prompts_redacted=false', () => {
        render(
            <SharedThreadShow token="abc" thread={baseThread} runs={[]} prompts_redacted={false} />,
        );
        expect(screen.queryByTestId('shared-redaction-notice')).not.toBeInTheDocument();
    });

    it('renders the empty-transcript state when runs is empty', () => {
        render(
            <SharedThreadShow token="abc" thread={baseThread} runs={[]} prompts_redacted={false} />,
        );
        expect(screen.getByTestId('shared-empty')).toBeInTheDocument();
    });

    it('renders a run row with prompt + output', () => {
        render(
            <SharedThreadShow
                token="abc"
                thread={baseThread}
                runs={[sampleRun]}
                prompts_redacted={false}
            />,
        );
        const card = screen.getByTestId(`shared-run-${sampleRun.id}`);
        expect(within(card).getByText('What is 2+2?')).toBeInTheDocument();
        expect(within(card).getByText('4')).toBeInTheDocument();
    });

    it('renders a Replay link on terminal runs pointing at /share/{token}/runs/{id}/replay', () => {
        render(
            <SharedThreadShow
                token="abctoken"
                thread={baseThread}
                runs={[sampleRun]}
                prompts_redacted={false}
            />,
        );
        const link = screen.getByTestId(`shared-replay-link-${sampleRun.id}`);
        expect(link).toBeInTheDocument();
        expect(link.getAttribute('href')).toBe('/share/abctoken/runs/100/replay');
    });

    it('does NOT render Replay link on streaming/pending runs', () => {
        render(
            <SharedThreadShow
                token="abc"
                thread={baseThread}
                runs={[
                    {
                        ...sampleRun,
                        id: 200,
                        status: 'streaming',
                        output_text: null,
                    },
                ]}
                prompts_redacted={false}
            />,
        );
        expect(screen.queryByTestId('shared-replay-link-200')).not.toBeInTheDocument();
    });

    it('header contains a link back to the home page (about)', () => {
        render(
            <SharedThreadShow token="abc" thread={baseThread} runs={[]} prompts_redacted={false} />,
        );
        const aboutLink = screen.getByTestId('shared-about-link');
        expect(aboutLink.getAttribute('href')).toBe('/');
    });
});
