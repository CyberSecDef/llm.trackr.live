import { describe, expect, it } from 'vitest';
import { computeStreamMetrics } from '@/lib/streamMetrics';
import type { RunEvent } from '@/types/runs';

/*
 * streamMetrics — derivation rules:
 *  - liveText = ordered concat of token.received tokens
 *  - elapsedMs = max(t_ms) across received tokens
 *  - TPS = output_tokens / (elapsedMs/1000) — null if either is 0
 *  - cost = (input + output) priced via per-million rates;
 *          null if pricing is null OR both rates are null
 *  - context = (input_tokens ?? 0) + output_tokens
 */

function tokenEvent(token: string, t_ms: number, index: number): RunEvent {
    return {
        event: 'token.received',
        payload: {
            run_id: 1,
            token,
            index,
            t_ms,
            logprobs: null,
            is_final: false,
        },
    };
}

describe('computeStreamMetrics', () => {
    it('returns zeroed metrics when no events have arrived', () => {
        const m = computeStreamMetrics({
            events: [],
            inputTokens: 0,
            contextLength: 8000,
            pricing: { pricing_input_per_million: 5, pricing_output_per_million: 15 },
        });
        expect(m.liveText).toBe('');
        expect(m.outputTokens).toBe(0);
        expect(m.elapsedMs).toBe(0);
        expect(m.tps).toBeNull();
        expect(m.contextUsed).toBe(0);
        expect(m.contextBudget).toBe(8000);
    });

    it('concatenates tokens in event order', () => {
        const m = computeStreamMetrics({
            events: [
                tokenEvent('Hello', 100, 0),
                tokenEvent(' ', 150, 1),
                tokenEvent('world', 200, 2),
            ],
            inputTokens: 0,
            contextLength: null,
            pricing: null,
        });
        expect(m.liveText).toBe('Hello world');
        expect(m.outputTokens).toBe(3);
    });

    it('elapsedMs is the highest token t_ms (handles out-of-order delivery)', () => {
        const m = computeStreamMetrics({
            events: [tokenEvent('a', 100, 0), tokenEvent('b', 300, 1), tokenEvent('c', 200, 2)],
            inputTokens: 0,
            contextLength: null,
            pricing: null,
        });
        expect(m.elapsedMs).toBe(300);
    });

    it('cumulative TPS = outputTokens / elapsed seconds', () => {
        // 5 tokens over 1000ms → 5 tps.
        const events: RunEvent[] = [];
        for (let i = 0; i < 5; i++) events.push(tokenEvent('x', 200 * (i + 1), i));
        const m = computeStreamMetrics({
            events,
            inputTokens: 0,
            contextLength: null,
            pricing: null,
        });
        expect(m.tps).toBeCloseTo(5, 5);
    });

    it('TPS is null when no tokens have arrived', () => {
        const m = computeStreamMetrics({
            events: [],
            inputTokens: 100,
            contextLength: null,
            pricing: null,
        });
        expect(m.tps).toBeNull();
    });

    it('cost = (input_tokens × input_price + output_tokens × output_price) / 1M', () => {
        // 500 input @ $5/M = $0.0025
        // 200 output @ $15/M = $0.003
        // total = $0.0055
        const events: RunEvent[] = [];
        for (let i = 0; i < 200; i++) events.push(tokenEvent('t', 10 * (i + 1), i));
        const m = computeStreamMetrics({
            events,
            inputTokens: 500,
            contextLength: null,
            pricing: { pricing_input_per_million: 5, pricing_output_per_million: 15 },
        });
        expect(m.costSoFar).toBeCloseTo(0.0055, 6);
    });

    it('cost is null when pricing object is null entirely', () => {
        const m = computeStreamMetrics({
            events: [tokenEvent('a', 100, 0)],
            inputTokens: 10,
            contextLength: null,
            pricing: null,
        });
        expect(m.costSoFar).toBeNull();
    });

    it('cost still computes with partial pricing (only output rate)', () => {
        const m = computeStreamMetrics({
            events: [tokenEvent('a', 100, 0)],
            inputTokens: 100,
            contextLength: null,
            pricing: { pricing_input_per_million: null, pricing_output_per_million: 15 },
        });
        // input contribution skipped, output = 1 token × $15/M = $0.000015
        expect(m.costSoFar).toBeCloseTo(0.000015, 9);
    });

    it('cost is null when both pricing rates are null (pricing object present but empty)', () => {
        const m = computeStreamMetrics({
            events: [tokenEvent('a', 100, 0)],
            inputTokens: 100,
            contextLength: null,
            pricing: { pricing_input_per_million: null, pricing_output_per_million: null },
        });
        expect(m.costSoFar).toBeNull();
    });

    it('contextUsed = input_tokens + output_tokens', () => {
        const m = computeStreamMetrics({
            events: [tokenEvent('a', 100, 0), tokenEvent('b', 200, 1)],
            inputTokens: 50,
            contextLength: 1000,
            pricing: null,
        });
        expect(m.contextUsed).toBe(52);
    });

    it('treats null input_tokens as zero', () => {
        const m = computeStreamMetrics({
            events: [tokenEvent('a', 100, 0)],
            inputTokens: null,
            contextLength: 1000,
            pricing: null,
        });
        expect(m.contextUsed).toBe(1);
    });

    it('ignores non-token events when counting / concatenating', () => {
        const m = computeStreamMetrics({
            events: [
                {
                    event: 'run.started',
                    payload: {
                        run_id: 1,
                        thread_id: 1,
                        model_id: 1,
                        started_at: '2026-05-19T00:00:00Z',
                    },
                },
                tokenEvent('text', 100, 0),
                {
                    event: 'layer.advanced',
                    payload: { run_id: 1, token_index: 0, total_layers: 12 },
                },
            ],
            inputTokens: 0,
            contextLength: null,
            pricing: null,
        });
        expect(m.outputTokens).toBe(1);
        expect(m.liveText).toBe('text');
    });
});
