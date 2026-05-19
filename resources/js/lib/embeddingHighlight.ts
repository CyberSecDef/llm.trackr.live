import type { EmbeddingPoint } from '@/data/embeddingClusters';
import type { RunEvent } from '@/types/runs';

/*
 * embeddingHighlight (M8 chunk 7) — map streamed token events
 * onto indices in the embedding scatter.
 *
 * Lookup strategy (fallback chain — first match wins):
 *   1. Exact match on the token string
 *   2. Trim leading/trailing whitespace
 *   3. Lowercase
 *
 * Tokens that miss every fallback are silently dropped — the
 * scatter visibly skips them. Synthetic clusters cover ~280
 * common tokens; most streams will hit a few dozen.
 *
 * Returned `visited` preserves event order so trail effects can
 * fade older positions back to base intensity.
 */

export interface EmbeddingLookup {
    /** Token-string → index into the points array. */
    byExact: Map<string, number>;
    /** Trimmed token-string → index. */
    byTrim: Map<string, number>;
    /** Lowercase token-string → index. */
    byLower: Map<string, number>;
}

export function buildEmbeddingLookup(points: EmbeddingPoint[]): EmbeddingLookup {
    const byExact = new Map<string, number>();
    const byTrim = new Map<string, number>();
    const byLower = new Map<string, number>();
    // First-occurrence wins for fallback maps — if multiple cluster
    // entries trim/lowercase to the same key, we pick the earlier one.
    for (let i = 0; i < points.length; i++) {
        const t = points[i].token;
        byExact.set(t, i);
        const trimmed = t.trim();
        if (!byTrim.has(trimmed)) byTrim.set(trimmed, i);
        const lower = t.toLowerCase();
        if (!byLower.has(lower)) byLower.set(lower, i);
    }
    return { byExact, byTrim, byLower };
}

export function resolveToken(token: string, lookup: EmbeddingLookup): number | null {
    // Exact match always wins so vocab entries like ' the' (with the
    // leading space) don't get redirected to the trimmed 'the' entry.
    const direct = lookup.byExact.get(token);
    if (direct !== undefined) return direct;

    // Trim fallback — picks up "the\n" → "the" matches.
    const trimmed = token.trim();
    const fromTrim = lookup.byTrim.get(trimmed);
    if (fromTrim !== undefined) return fromTrim;

    // Lowercase fallback — picks up "World" vs "world".
    const lower = token.toLowerCase();
    const fromLower = lookup.byLower.get(lower);
    if (fromLower !== undefined) return fromLower;

    // Trim + lowercase combined — picks up " WORLD " → "world".
    const tl = trimmed.toLowerCase();
    const fromTrimLower = lookup.byLower.get(tl) ?? lookup.byTrim.get(tl);
    if (fromTrimLower !== undefined) return fromTrimLower;

    return null;
}

export interface EmbeddingHighlight {
    /** Indices of matched tokens in event order. Duplicates kept so
     *  the trail can visualize revisits. */
    visited: number[];
    /** Index of the most recent matched token, or null if none. */
    latest: number | null;
}

export function extractTokenSequence(
    events: RunEvent[],
    lookup: EmbeddingLookup,
): EmbeddingHighlight {
    const visited: number[] = [];
    let latest: number | null = null;
    for (const e of events) {
        if (e.event !== 'token.received') continue;
        const idx = resolveToken(e.payload.token, lookup);
        if (idx === null) continue;
        visited.push(idx);
        latest = idx;
    }
    return { visited, latest };
}
