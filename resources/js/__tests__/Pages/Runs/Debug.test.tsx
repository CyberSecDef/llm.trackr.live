import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Override the global Inertia mock from test/setup.ts so AppLayout
// sees a non-null user (it returns null otherwise — which would make
// the whole page render empty).
vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
        useForm: () => ({ post: vi.fn(), processing: false }),
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Alice', email: 'a@example.com', role: 'user' } },
                errors: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/runs/42/debug',
            component: 'Runs/Debug',
            version: null,
        }),
    };
});

import React from 'react';
import Debug from '@/Pages/Runs/Debug';

/*
 * Vitest test for the run debug page (M6 chunk 4b).
 *
 * Echo is stubbed the same way the useRunStream hook test does it —
 * `.private()` returns a channel-like object whose handlers can be
 * triggered manually. The page is rendered through React, and we
 * assert the metadata header is present and incoming events show up
 * in the JSON pre block.
 */

const sampleRun = {
    id: 42,
    thread_id: 7,
    model_id: 13,
    sequence_in_thread: 1,
    status: 'pending',
    prompt: 'Hello world',
    parameters: { temperature: 0.7 },
    output_text: null,
    error_message: null,
    created_at: '2026-05-18T00:00:00Z',
};

interface FakeChannel {
    listen: ReturnType<typeof vi.fn>;
    stopListening: ReturnType<typeof vi.fn>;
    trigger: (name: string, payload: unknown) => void;
}

function fakeChannel(): FakeChannel {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers: Record<string, (payload: any) => void> = {};
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listen: vi.fn((name: string, cb: (payload: any) => void) => {
            handlers[name] = cb;
        }),
        stopListening: vi.fn((name: string) => {
            delete handlers[name];
        }),
        trigger(name, payload) {
            handlers[name]?.(payload);
        },
    };
}

beforeEach(() => {
    const channel = fakeChannel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Echo = {
        private: vi.fn(() => channel),
        leave: vi.fn(),
        __channel: channel,
    };
});

afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Echo = null;
});

describe('<DebugRun />', () => {
    it('renders the metadata header with run details', () => {
        render(<Debug run={sampleRun} channel="private-runs.42" />);
        const meta = screen.getByTestId('run-metadata');
        expect(within(meta).getByText('7')).toBeInTheDocument(); // thread_id
        expect(within(meta).getByText('13')).toBeInTheDocument(); // model_id
        expect(within(meta).getByText('pending')).toBeInTheDocument();
    });

    it('shows the subscribed channel name', () => {
        render(<Debug run={sampleRun} channel="private-runs.42" />);
        const channel = screen.getByTestId('debug-channel');
        expect(channel.textContent).toContain('private-runs.42');
        expect(channel.textContent).toContain('idle');
    });

    it('shows the waiting placeholder before any events arrive', () => {
        render(<Debug run={sampleRun} channel="private-runs.42" />);
        expect(screen.getByTestId('event-stream').textContent).toContain('waiting for events');
    });

    it('renders incoming events as JSON in the event stream', () => {
        render(<Debug run={sampleRun} channel="private-runs.42" />);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => {
            channel.trigger('.run.started', {
                run_id: 42,
                thread_id: 7,
                model_id: 13,
                started_at: '2026-05-18T00:00:01Z',
            });
            channel.trigger('.token.received', {
                run_id: 42,
                token: 'Hi',
                index: 0,
                t_ms: 12,
                logprobs: null,
                is_final: false,
            });
        });

        const stream = screen.getByTestId('event-stream').textContent ?? '';
        expect(stream).toContain('"event": "run.started"');
        expect(stream).toContain('"event": "token.received"');
        expect(stream).toContain('"token": "Hi"');
    });

    it('reflects status transitions in the header', () => {
        render(<Debug run={sampleRun} channel="private-runs.42" />);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (window as any).Echo.__channel;

        act(() => channel.trigger('.run.started', { run_id: 42 }));
        expect(screen.getByTestId('debug-channel').textContent).toContain('streaming');

        act(() =>
            channel.trigger('.run.completed', {
                run_id: 42,
                input_tokens: 5,
                output_tokens: 10,
                duration_ms: 1000,
                tokens_per_second: 10,
                estimated_cost: 0.001,
            }),
        );
        expect(screen.getByTestId('debug-channel').textContent).toContain('complete');
    });

    it('shows the Echo-disabled notice when window.Echo is null', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Echo = null;

        render(<Debug run={sampleRun} channel="private-runs.42" />);
        expect(screen.getByTestId('echo-disabled-notice')).toBeInTheDocument();
    });
});
