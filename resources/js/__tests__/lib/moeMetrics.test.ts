import { describe, expect, it } from 'vitest';
import { extractLatestRouting, extractUtilization } from '@/lib/moeMetrics';
import type { RunEvent } from '@/types/runs';

function routingEvent(tokenIndex: number, experts: number[], scores: number[]): RunEvent {
    return {
        event: 'moe.routed',
        payload: {
            run_id: 1,
            token_index: tokenIndex,
            experts,
            scores,
        },
    };
}

describe('extractLatestRouting', () => {
    it('returns null when no moe.routed events are present', () => {
        expect(extractLatestRouting([])).toBeNull();
    });

    it('returns the latest moe.routed event', () => {
        const events: RunEvent[] = [
            routingEvent(0, [0, 1], [0.6, 0.4]),
            routingEvent(1, [3, 7], [0.7, 0.3]),
        ];
        const latest = extractLatestRouting(events);
        expect(latest?.tokenIndex).toBe(1);
        expect(latest?.experts.map((e) => e.id)).toEqual([3, 7]);
    });

    it('normalizes scores so the K experts sum to 1', () => {
        const events: RunEvent[] = [routingEvent(0, [0, 1, 2], [0.5, 0.3, 0.2])];
        const latest = extractLatestRouting(events)!;
        const sum = latest.experts.reduce((acc, e) => acc + e.normalizedScore, 0);
        expect(sum).toBeCloseTo(1, 6);
    });

    it('renormalizes even when the K raw scores do not sum to 1', () => {
        // Vendor returns un-normalized raw logits.
        const events: RunEvent[] = [routingEvent(0, [0, 1], [3, 1])];
        const latest = extractLatestRouting(events)!;
        expect(latest.experts[0].normalizedScore).toBeCloseTo(0.75, 6);
        expect(latest.experts[1].normalizedScore).toBeCloseTo(0.25, 6);
    });

    it('sorts experts descending by normalized score', () => {
        const events: RunEvent[] = [routingEvent(0, [5, 1, 3], [0.1, 0.6, 0.3])];
        const latest = extractLatestRouting(events)!;
        expect(latest.experts.map((e) => e.id)).toEqual([1, 3, 5]);
    });

    it('keeps raw scores alongside the normalized values', () => {
        const events: RunEvent[] = [routingEvent(0, [0, 1], [2.5, 1.5])];
        const latest = extractLatestRouting(events)!;
        const a = latest.experts.find((e) => e.id === 0)!;
        expect(a.rawScore).toBe(2.5);
    });

    it('skips degenerate events (empty experts or mismatched arrays)', () => {
        const events: RunEvent[] = [
            routingEvent(0, [0, 1], [0.5, 0.5]),
            routingEvent(1, [], []),
            routingEvent(2, [0, 1], [0.7]), // length mismatch
        ];
        // Walks backwards; events #2 and #1 are skipped, falls to #0.
        const latest = extractLatestRouting(events);
        expect(latest?.tokenIndex).toBe(0);
    });

    it('ignores non-moe.routed events', () => {
        const events: RunEvent[] = [
            routingEvent(0, [0, 1], [0.5, 0.5]),
            {
                event: 'token.received',
                payload: {
                    run_id: 1,
                    token: 'x',
                    index: 0,
                    t_ms: 10,
                    logprobs: null,
                    is_final: false,
                },
            },
        ];
        const latest = extractLatestRouting(events);
        expect(latest?.tokenIndex).toBe(0);
    });
});

describe('extractUtilization', () => {
    it('returns an empty counts array when no events are present', () => {
        const u = extractUtilization([], 8);
        expect(u.counts).toHaveLength(8);
        expect(u.totalActivations).toBe(0);
        expect(u.routedTokenCount).toBe(0);
    });

    it('counts every expert activation across moe.routed events', () => {
        const events: RunEvent[] = [
            routingEvent(0, [0, 3], [0.5, 0.5]),
            routingEvent(1, [3, 7], [0.5, 0.5]),
            routingEvent(2, [3, 0], [0.5, 0.5]),
        ];
        const u = extractUtilization(events, 8);
        expect(u.counts[0]).toBe(2);
        expect(u.counts[3]).toBe(3);
        expect(u.counts[7]).toBe(1);
        expect(u.totalActivations).toBe(6); // 3 events × 2 experts
        expect(u.routedTokenCount).toBe(3);
    });

    it('falls back to max-expert-id-seen + 1 when totalExperts is null', () => {
        const events: RunEvent[] = [routingEvent(0, [0, 5], [0.5, 0.5])];
        const u = extractUtilization(events, null);
        expect(u.counts).toHaveLength(6); // 0..5
        expect(u.counts[5]).toBe(1);
    });

    it('returns counts=[] when no MoE events AND no totalExperts', () => {
        const u = extractUtilization([], null);
        expect(u.counts).toEqual([]);
        expect(u.totalActivations).toBe(0);
    });

    it('respects totalExperts even when events reference larger IDs (defensive)', () => {
        // A misconfigured model snapshot might say 4 but the vendor
        // reports expert id 7. Keep the array sized to the snapshot
        // value; out-of-range IDs are dropped.
        const events: RunEvent[] = [routingEvent(0, [7, 0], [0.5, 0.5])];
        const u = extractUtilization(events, 4);
        expect(u.counts).toHaveLength(4);
        expect(u.counts[0]).toBe(1);
        // expert 7 dropped — out of range.
        expect(u.totalActivations).toBe(1);
    });

    it('ignores non-moe.routed events', () => {
        const events: RunEvent[] = [
            {
                event: 'token.received',
                payload: {
                    run_id: 1,
                    token: 'x',
                    index: 0,
                    t_ms: 10,
                    logprobs: null,
                    is_final: false,
                },
            },
            routingEvent(0, [0, 1], [0.5, 0.5]),
        ];
        const u = extractUtilization(events, 8);
        expect(u.routedTokenCount).toBe(1);
    });
});
