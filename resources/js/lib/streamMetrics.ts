import type { RunEvent } from '@/types/runs';

/*
 * streamMetrics (M8 chunk 4) — pure derivation of live-run metrics
 * from the event stream + run / model context.
 *
 * Kept pure so the live-row UI doesn't carry buffer state and the
 * math is unit-testable without React. The hook consumer just calls
 * this on every render; events flow through useRunStream and the
 * parent re-renders on each new event.
 *
 * TPS is cumulative — total output tokens / total elapsed seconds —
 * by user decision: smoother, no rolling buffer needed. Elapsed is
 * derived from the most-recent token's `t_ms` rather than wall time,
 * so we don't need a ticker between events.
 *
 * Context budget pulls from `model.context_length`; cost from
 * `pricing_input_per_million` + `pricing_output_per_million`. Any
 * missing piece degrades gracefully to `null` so the UI can hide
 * that row instead of rendering "$NaN".
 */

export interface StreamPricing {
    pricing_input_per_million: number | null;
    pricing_output_per_million: number | null;
}

export interface StreamMetricsInput {
    events: RunEvent[];
    /** From `runs.input_tokens` — server-side, set once the vendor
     *  reports it. Treated as 0 until the row updates. */
    inputTokens: number | null;
    /** From `model.context_length`. Null when unknown. */
    contextLength: number | null;
    /** From `model.pricing_*`. Null when model not found. */
    pricing: StreamPricing | null;
}

export interface StreamMetrics {
    /** Concatenated token text — drives the live <Assistant> bubble. */
    liveText: string;
    outputTokens: number;
    /** Latest token's t_ms (ms since stream start). 0 when no tokens. */
    elapsedMs: number;
    /** Cumulative output_tokens / elapsed_sec. Null until both > 0. */
    tps: number | null;
    /** USD estimate. Null when pricing is missing entirely. */
    costSoFar: number | null;
    /** input_tokens + output_tokens. */
    contextUsed: number;
    /** Echo of contextLength for the consumer's convenience. */
    contextBudget: number | null;
}

export function computeStreamMetrics(input: StreamMetricsInput): StreamMetrics {
    const tokens: string[] = [];
    let lastTMs = 0;
    let outputTokens = 0;

    for (const e of input.events) {
        if (e.event === 'token.received') {
            tokens.push(e.payload.token);
            if (e.payload.t_ms > lastTMs) lastTMs = e.payload.t_ms;
            outputTokens++;
        }
    }

    const tps = outputTokens > 0 && lastTMs > 0 ? (outputTokens / lastTMs) * 1000 : null;

    const inputTokens = input.inputTokens ?? 0;
    const contextUsed = inputTokens + outputTokens;

    let costSoFar: number | null = null;
    if (input.pricing) {
        const inPrice = input.pricing.pricing_input_per_million;
        const outPrice = input.pricing.pricing_output_per_million;
        if (inPrice !== null || outPrice !== null) {
            const inCost = inPrice !== null ? (inputTokens / 1_000_000) * inPrice : 0;
            const outCost = outPrice !== null ? (outputTokens / 1_000_000) * outPrice : 0;
            costSoFar = inCost + outCost;
        }
    }

    return {
        liveText: tokens.join(''),
        outputTokens,
        elapsedMs: lastTMs,
        tps,
        costSoFar,
        contextUsed,
        contextBudget: input.contextLength,
    };
}
