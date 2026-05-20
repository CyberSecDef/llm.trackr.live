import { describe, expect, it } from 'vitest';
import { deriveVizAnnouncement } from '@/lib/vizAnnouncement';
import type { RunEvent } from '@/types/runs';

const start = (): RunEvent => ({
    event: 'run.started',
    payload: { run_id: 1, thread_id: 1, model_id: 1, started_at: '2026-05-19T00:00:00Z' },
});

const token = (i: number): RunEvent => ({
    event: 'token.received',
    payload: {
        run_id: 1,
        token: `t${i}`,
        index: i,
        t_ms: i * 50,
        logprobs: null,
        is_final: false,
    },
});

const completed = (): RunEvent => ({
    event: 'run.completed',
    payload: {
        run_id: 1,
        input_tokens: 0,
        output_tokens: 0,
        duration_ms: 0,
        tokens_per_second: 0,
        estimated_cost: null,
    },
});

const errored = (msg: string): RunEvent => ({
    event: 'run.errored',
    payload: { run_id: 1, message: msg, partial_output: null },
});

describe('deriveVizAnnouncement', () => {
    it('returns empty string for no events', () => {
        expect(deriveVizAnnouncement([], 'Run started.')).toBe('');
    });

    it('uses the startedLabel for any non-token early state', () => {
        expect(deriveVizAnnouncement([start()], 'Run started.')).toBe('Run started.');
        expect(deriveVizAnnouncement([start()], 'Embedding scene loaded.')).toBe(
            'Embedding scene loaded.',
        );
    });

    it('stays on startedLabel until the first decile', () => {
        const events = [start(), ...Array.from({ length: 9 }, (_, i) => token(i))];
        expect(deriveVizAnnouncement(events, 'Run started.')).toBe('Run started.');
    });

    it('flips to "10 tokens generated." at the first decile', () => {
        const events = [start(), ...Array.from({ length: 10 }, (_, i) => token(i))];
        expect(deriveVizAnnouncement(events, 'Run started.')).toBe('10 tokens generated.');
    });

    it('flips to "30 tokens generated." at the third decile', () => {
        const events = [start(), ...Array.from({ length: 30 }, (_, i) => token(i))];
        expect(deriveVizAnnouncement(events, 'Run started.')).toBe('30 tokens generated.');
    });

    it('announces completion with token count + singular/plural', () => {
        const oneToken = [start(), token(0), completed()];
        expect(deriveVizAnnouncement(oneToken, 'Run started.')).toBe(
            'Run complete. 1 token generated.',
        );

        const manyTokens = [
            start(),
            ...Array.from({ length: 47 }, (_, i) => token(i)),
            completed(),
        ];
        expect(deriveVizAnnouncement(manyTokens, 'Run started.')).toBe(
            'Run complete. 47 tokens generated.',
        );
    });

    it('announces errors with the error message', () => {
        const errors = [start(), token(0), errored('rate limit exceeded')];
        expect(deriveVizAnnouncement(errors, 'Run started.')).toBe(
            'Run errored: rate limit exceeded.',
        );
    });

    it('errors take precedence over completion or token milestones', () => {
        const both = [start(), token(0), errored('oops'), completed()];
        expect(deriveVizAnnouncement(both, 'Run started.')).toBe('Run errored: oops.');
    });
});
