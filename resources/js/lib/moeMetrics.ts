import type { RunEvent } from '@/types/runs';

/*
 * moeMetrics (M8 chunk 6) — derive the two MoE views from the
 * event stream:
 *
 *   1. extractLatestRouting — the most recent moe.routed event's
 *      selected experts + per-K-normalized scores. Drives the
 *      "router scores for the latest token" bar chart.
 *
 *   2. extractUtilization — cumulative activation count per
 *      expert across the run. Drives the mini-bar chart that
 *      shows long-tail vs concentrated routing.
 *
 * Both functions are pure; the MoERouting component owns no
 * derivation logic. `totalExperts` falls back to inferring the
 * max expert ID seen in events when the model snapshot is
 * missing it, so utilization stays correct even without the
 * model registry.
 */

export interface MoERoutingExpert {
    id: number;
    /** Raw router score from the vendor event. */
    rawScore: number;
    /** Normalized so the K selected experts sum to 1. */
    normalizedScore: number;
}

export interface MoELatestRouting {
    /** token_index from the moe.routed event. */
    tokenIndex: number;
    /** Selected experts for this token, sorted descending by score. */
    experts: MoERoutingExpert[];
}

export function extractLatestRouting(events: RunEvent[]): MoELatestRouting | null {
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.event !== 'moe.routed') continue;
        const { token_index, experts, scores } = e.payload;
        if (experts.length === 0 || scores.length === 0) continue;
        if (experts.length !== scores.length) continue;

        const sum = scores.reduce((acc, s) => acc + s, 0);
        const paired: MoERoutingExpert[] = experts.map((id, idx) => ({
            id,
            rawScore: scores[idx],
            normalizedScore: sum > 0 ? scores[idx] / sum : 0,
        }));
        paired.sort((a, b) => b.normalizedScore - a.normalizedScore);
        return { tokenIndex: token_index, experts: paired };
    }
    return null;
}

export interface MoEUtilization {
    /** counts[i] = number of times expert i was activated. */
    counts: number[];
    /** Sum of counts = total activations across all routed tokens. */
    totalActivations: number;
    /** Distinct moe.routed events seen. */
    routedTokenCount: number;
}

/**
 * Cumulative utilization across every moe.routed event. If
 * `totalExperts` is null/undefined the array is sized to the
 * highest expert ID seen + 1 (so a Mixtral run without model
 * metadata still shows 8 slots).
 */
export function extractUtilization(
    events: RunEvent[],
    totalExperts: number | null | undefined,
): MoEUtilization {
    let maxId = -1;
    let routedTokenCount = 0;
    for (const e of events) {
        if (e.event !== 'moe.routed') continue;
        routedTokenCount++;
        for (const id of e.payload.experts) {
            if (id > maxId) maxId = id;
        }
    }
    const size = totalExperts && totalExperts > 0 ? totalExperts : maxId >= 0 ? maxId + 1 : 0;
    const counts = new Array<number>(size).fill(0);
    let total = 0;
    for (const e of events) {
        if (e.event !== 'moe.routed') continue;
        for (const id of e.payload.experts) {
            if (id >= 0 && id < size) {
                counts[id]++;
                total++;
            }
        }
    }
    return { counts, totalActivations: total, routedTokenCount };
}
