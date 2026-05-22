import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CinematicViz from '@/Components/Viz/CinematicViz';
import type { RunEvent } from '@/types/runs';

/*
 * Full-pipeline integration test (M13 chunk 14).
 *
 * Per the chunk-14 spec line: "Integration test: full-pipeline
 * end-to-end with a mock event stream that fires through scenes
 * 0-20 + asserts the chat bubble accumulates the right output."
 *
 * The runner advances asynchronously via requestAnimationFrame
 * (chunk-1 useSceneRunner). Driving it through all 21 scenes
 * synchronously in jsdom is impractical — RAF cadence + per-scene
 * durations would push the test runtime past sensible limits.
 *
 * What we DO test end-to-end:
 *   1. CinematicViz mounts cleanly with a fully-populated event
 *      stream + a prompt + the default ALL_SCENES registry.
 *   2. The ChatBubble's WebSocket-driven path (chunk 10b) renders
 *      ALL token events from the stream regardless of which scene
 *      the runner happens to be on — i.e., the "ahead-of-viz"
 *      property the spec calls out.
 *   3. The persistent UI surfaces (vocab sidebar, layer counter,
 *      pipeline progress bar) are present + populated.
 *   4. The is_final flag flips the chat bubble to its "complete"
 *      mode and removes the streaming cursor.
 *
 * The per-scene render walk-through is covered by
 * scene-determinism.test.ts; this file complements it with a
 * cross-cutting "everything mounts together" assertion.
 */

const STREAM: RunEvent[] = [
    {
        event: 'run.started',
        payload: {
            run_id: 42,
            thread_id: 7,
            model_id: 10,
            started_at: '2026-05-22T00:00:00Z',
        },
    },
    {
        event: 'token.received',
        payload: {
            run_id: 42,
            token: ' Hello',
            index: 0,
            t_ms: 120,
            logprobs: null,
            is_final: false,
        },
    },
    {
        event: 'token.received',
        payload: {
            run_id: 42,
            token: ' world',
            index: 1,
            t_ms: 250,
            logprobs: null,
            is_final: false,
        },
    },
    {
        event: 'token.received',
        payload: {
            run_id: 42,
            token: '!',
            index: 2,
            t_ms: 360,
            logprobs: null,
            is_final: true,
        },
    },
    {
        event: 'run.completed',
        payload: {
            run_id: 42,
            input_tokens: 3,
            output_tokens: 3,
            duration_ms: 360,
            tokens_per_second: 8.3,
            estimated_cost: 0.001,
        },
    },
];

describe('M13 chunk 14 — full-pipeline integration', () => {
    it('mounts CinematicViz with all persistent UI + the mock event stream', () => {
        render(
            <CinematicViz
                events={STREAM}
                prompt="hello world"
                model={{
                    layers: 32,
                    attention_heads: 32,
                    context_length: 128000,
                    architecture_type: 'llama',
                }}
            />,
        );

        // Persistent UI: vocab sidebar, chat bubble, layer counter,
        // pipeline progress bar. All four surfaces present from
        // chunks 1 / 3c / 10a / 10b.
        expect(screen.getByTestId('viz-vocab-sidebar')).toBeInTheDocument();
        expect(screen.getByTestId('viz-chat-bubble')).toBeInTheDocument();
        expect(screen.getByTestId('viz-layer-counter')).toBeInTheDocument();
        expect(screen.getByTestId('viz-pipeline-progress')).toBeInTheDocument();
    });

    it('chat bubble accumulates ALL streamed tokens regardless of scene position', () => {
        render(<CinematicViz events={STREAM} prompt="hello world" model={null} />);

        // The bubble runs the events-primary path (chunk 10b).
        // All 3 tokens from STREAM should be concatenated.
        const text = screen.getByTestId('viz-chat-bubble-text');
        expect(text.textContent).toContain(' Hello world!');
    });

    it('chat bubble shows the token count from the event stream', () => {
        render(<CinematicViz events={STREAM} prompt="hello" model={null} />);
        const count = screen.getByTestId('viz-chat-bubble-count');
        expect(count.textContent).toContain('3 tokens');
    });

    it('chat bubble flips to "complete" mode when is_final fires', () => {
        render(<CinematicViz events={STREAM} prompt="hello" model={null} />);
        const bubble = screen.getByTestId('viz-chat-bubble');
        expect(bubble.getAttribute('data-final')).toBe('true');
        // Cursor hidden when final.
        expect(screen.queryByTestId('viz-chat-bubble-cursor')).not.toBeInTheDocument();
        // Count carries the " · complete" suffix.
        expect(screen.getByTestId('viz-chat-bubble-count').textContent).toMatch(/complete/i);
    });

    it('chat bubble streams partial output mid-run (is_final=false on last event)', () => {
        const partial = STREAM.slice(0, 3); // 2 token events, neither final
        render(<CinematicViz events={partial} prompt="hello" model={null} />);
        const bubble = screen.getByTestId('viz-chat-bubble');
        expect(bubble.getAttribute('data-final')).toBe('false');
        // Cursor visible during streaming.
        expect(screen.getByTestId('viz-chat-bubble-cursor')).toBeInTheDocument();
        // Text reflects the 2 tokens received so far.
        expect(screen.getByTestId('viz-chat-bubble-text').textContent).toContain(' Hello world');
        expect(screen.getByTestId('viz-chat-bubble-text').textContent).not.toContain('!');
    });

    it('PlaybackControls mount with the live target derived from the event stream', () => {
        render(<CinematicViz events={STREAM} prompt="hello world" model={null} />);
        // STREAM has is_final=true → liveSceneIndex = 20 (detokenize)
        // → jump-to-live button is enabled.
        const jumpLive = screen.getByTestId('viz-playback-jump-live');
        expect(jumpLive).not.toBeDisabled();
    });

    it('jump-to-live is null/disabled when no token events have arrived', () => {
        const noTokens: RunEvent[] = [
            {
                event: 'run.started',
                payload: {
                    run_id: 99,
                    thread_id: 1,
                    model_id: 10,
                    started_at: '2026-05-22T00:00:00Z',
                },
            },
        ];
        render(<CinematicViz events={noTokens} prompt="hi" model={null} />);
        expect(screen.getByTestId('viz-playback-jump-live')).toBeDisabled();
    });

    it('FpsCounter mounts inside the canvas (dev-only or ?debug=fps)', () => {
        // import.meta.env.DEV is true in vitest; the counter should
        // render. The performance-mode-driven degraded flag starts
        // at false (no frames sampled yet → fps=0).
        render(<CinematicViz events={STREAM} prompt="hello" model={null} />);
        const fps = screen.getByTestId('fps-counter');
        expect(fps).toBeInTheDocument();
        expect(fps.getAttribute('data-degraded')).toBe('false');
    });
});
