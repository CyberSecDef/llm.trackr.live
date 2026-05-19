import { describe, expect, it } from 'vitest';
import { buildEmbeddingLookup, extractTokenSequence, resolveToken } from '@/lib/embeddingHighlight';
import type { EmbeddingPoint } from '@/data/embeddingClusters';
import type { RunEvent } from '@/types/runs';

const points: EmbeddingPoint[] = [
    { token: 'the', position: [0, 0, 0], clusterIndex: 0, color: '#fff' },
    { token: ' the', position: [0.1, 0, 0], clusterIndex: 0, color: '#fff' },
    { token: '.', position: [1, 0, 0], clusterIndex: 1, color: '#fff' },
    { token: 'def', position: [2, 0, 0], clusterIndex: 2, color: '#fff' },
    { token: 'World', position: [3, 0, 0], clusterIndex: 3, color: '#fff' },
];

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

describe('buildEmbeddingLookup + resolveToken', () => {
    const lookup = buildEmbeddingLookup(points);

    it('returns null when token has no match across any fallback', () => {
        expect(resolveToken('quaternion', lookup)).toBeNull();
    });

    it('matches exact', () => {
        expect(resolveToken('the', lookup)).toBe(0);
        expect(resolveToken('def', lookup)).toBe(3);
    });

    it('matches trimmed token to base form', () => {
        // ' the\n' trims to 'the' — should match index 0.
        expect(resolveToken(' the\n', lookup)).toBe(0);
    });

    it('exact match wins over trim fallback', () => {
        // ' the' is itself an entry (index 1) — should NOT fall
        // through to the trim map which would give index 0.
        expect(resolveToken(' the', lookup)).toBe(1);
    });

    it('matches lowercase token to capitalized vocab entry', () => {
        // 'world' (lowercase) should match 'World' via the lowercase map.
        expect(resolveToken('world', lookup)).toBe(4);
    });

    it('combines trim + lowercase for the final fallback', () => {
        // ' WORLD ' should normalize through trim+lowercase.
        expect(resolveToken(' WORLD ', lookup)).toBe(4);
    });
});

describe('extractTokenSequence', () => {
    const lookup = buildEmbeddingLookup(points);

    it('returns empty visited + null latest on no events', () => {
        const out = extractTokenSequence([], lookup);
        expect(out.visited).toEqual([]);
        expect(out.latest).toBeNull();
    });

    it('preserves event order in visited', () => {
        const events: RunEvent[] = [
            tokenEvent('the', 100, 0),
            tokenEvent('def', 200, 1),
            tokenEvent('.', 300, 2),
        ];
        const out = extractTokenSequence(events, lookup);
        expect(out.visited).toEqual([0, 3, 2]);
        expect(out.latest).toBe(2);
    });

    it('keeps duplicates so trail effects can show revisits', () => {
        const events: RunEvent[] = [tokenEvent('the', 100, 0), tokenEvent('the', 200, 1)];
        const out = extractTokenSequence(events, lookup);
        expect(out.visited).toEqual([0, 0]);
    });

    it('silently skips tokens that match nothing', () => {
        const events: RunEvent[] = [
            tokenEvent('the', 100, 0),
            tokenEvent('quaternion', 200, 1),
            tokenEvent('def', 300, 2),
        ];
        const out = extractTokenSequence(events, lookup);
        expect(out.visited).toEqual([0, 3]);
        expect(out.latest).toBe(3);
    });

    it('ignores non-token.received events', () => {
        const events: RunEvent[] = [
            {
                event: 'run.started',
                payload: { run_id: 1, thread_id: 1, model_id: 1, started_at: 'x' },
            },
            tokenEvent('the', 100, 0),
        ];
        const out = extractTokenSequence(events, lookup);
        expect(out.visited).toEqual([0]);
    });
});
