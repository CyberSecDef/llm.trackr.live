import { describe, expect, it } from 'vitest';
import { extractLatestLogprobs } from '@/lib/logitsExtract';
import type { RunEvent, TokenLogprob } from '@/types/runs';

function tokenEvent(
    token: string,
    t_ms: number,
    index: number,
    logprobs: TokenLogprob[] | null = null,
): RunEvent {
    return {
        event: 'token.received',
        payload: {
            run_id: 1,
            token,
            index,
            t_ms,
            logprobs,
            is_final: false,
        },
    };
}

describe('extractLatestLogprobs', () => {
    it('returns null on an empty event array', () => {
        expect(extractLatestLogprobs([])).toBeNull();
    });

    it('returns null when no token events have logprobs', () => {
        const events: RunEvent[] = [tokenEvent('a', 100, 0, null), tokenEvent('b', 200, 1, null)];
        expect(extractLatestLogprobs(events)).toBeNull();
    });

    it('extracts the most recent non-null logprobs (latest wins)', () => {
        // Older token has logprobs but we want the newer one.
        const events: RunEvent[] = [
            tokenEvent('older', 100, 0, [
                { token: 'older', logprob: Math.log(0.7) },
                { token: 'other', logprob: Math.log(0.3) },
            ]),
            tokenEvent('newer', 200, 1, [
                { token: 'newer', logprob: Math.log(0.6) },
                { token: 'alt', logprob: Math.log(0.4) },
            ]),
        ];
        const snap = extractLatestLogprobs(events);
        expect(snap?.chosenToken).toBe('newer');
        expect(snap?.alternatives[0].token).toBe('newer');
    });

    it('falls back to the previous logprob-bearing event when latest has null', () => {
        const events: RunEvent[] = [
            tokenEvent('with-logprobs', 100, 0, [
                { token: 'with-logprobs', logprob: Math.log(0.9) },
                { token: 'other', logprob: Math.log(0.1) },
            ]),
            // Latest token has no logprobs — but earlier still does.
            tokenEvent('latest', 200, 1, null),
        ];
        // Spec: "latest token.received with non-null logprobs." So
        // when the latest is null we walk back until we find one.
        const snap = extractLatestLogprobs(events);
        expect(snap?.chosenToken).toBe('with-logprobs');
    });

    it('normalizes probabilities so the top-K sums to 1', () => {
        const events: RunEvent[] = [
            tokenEvent('a', 100, 0, [
                { token: 'a', logprob: Math.log(0.5) },
                { token: 'b', logprob: Math.log(0.3) },
                { token: 'c', logprob: Math.log(0.1) },
                // Sum < 1 — vendor truncated the tail.
            ]),
        ];
        const snap = extractLatestLogprobs(events);
        const sum = snap!.alternatives.reduce((acc, p) => acc + p.probability, 0);
        expect(sum).toBeCloseTo(1, 6);
    });

    it('sorts alternatives descending by probability', () => {
        const events: RunEvent[] = [
            tokenEvent('chosen', 100, 0, [
                { token: 'low', logprob: Math.log(0.1) },
                { token: 'chosen', logprob: Math.log(0.6) },
                { token: 'mid', logprob: Math.log(0.3) },
            ]),
        ];
        const snap = extractLatestLogprobs(events);
        const probs = snap!.alternatives.map((a) => a.probability);
        for (let i = 1; i < probs.length; i++) {
            expect(probs[i]).toBeLessThanOrEqual(probs[i - 1]);
        }
    });

    it('trims to topK', () => {
        const logprobs: TokenLogprob[] = [];
        for (let i = 0; i < 20; i++) {
            logprobs.push({ token: `t${i}`, logprob: Math.log(0.05) });
        }
        const events: RunEvent[] = [tokenEvent('t0', 100, 0, logprobs)];
        const snap = extractLatestLogprobs(events, 5);
        expect(snap!.alternatives).toHaveLength(5);
    });

    it('skips non-token.received events between renders', () => {
        const events: RunEvent[] = [
            tokenEvent('a', 100, 0, [{ token: 'a', logprob: Math.log(0.8) }]),
            // run.completed in between — must not interfere.
            {
                event: 'run.completed',
                payload: {
                    run_id: 1,
                    input_tokens: 10,
                    output_tokens: 1,
                    duration_ms: 250,
                    tokens_per_second: 5,
                    estimated_cost: 0.001,
                },
            },
        ];
        const snap = extractLatestLogprobs(events);
        expect(snap?.chosenToken).toBe('a');
    });

    it('returns null when the logprobs array is present but empty', () => {
        const events: RunEvent[] = [tokenEvent('a', 100, 0, [])];
        expect(extractLatestLogprobs(events)).toBeNull();
    });
});
