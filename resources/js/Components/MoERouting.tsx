import { extractLatestRouting, extractUtilization } from '@/lib/moeMetrics';
import { cn } from '@/lib/utils';
import type { RunEvent } from '@/types/runs';

/*
 * MoERouting (M8 chunk 6) — per-token MoE router insight.
 *
 * Two views stacked:
 *   1. Latest router scores: top-K experts for the most recent
 *      moe.routed event, bars normalized to 100% (matches the
 *      chunk-5b logits chart visual language).
 *   2. Cumulative utilization: one bar per expert in the model,
 *      height proportional to activation count. Scales to large
 *      expert pools (Mixtral's 8 vs DeepSeek's 160) by varying
 *      bar width — the grid fills the available width.
 *
 * Returns null when:
 *   - the event stream has no moe.routed events
 *   - architecture_type !== 'moe' (the caller is expected to gate
 *     mounting; this component still tolerates non-MoE events as
 *     a safety net)
 */

interface MoERoutingProps {
    events: RunEvent[];
    /** From model.moe_experts. Sets the utilization grid width. */
    totalExperts: number | null;
    /** From model.moe_active_experts. Used in the header label only. */
    activeExperts: number | null;
}

export default function MoERouting({ events, totalExperts, activeExperts }: MoERoutingProps) {
    const latest = extractLatestRouting(events);
    const utilization = extractUtilization(events, totalExperts);

    if (latest === null && utilization.routedTokenCount === 0) {
        return null;
    }

    return (
        <div className="space-y-2" data-testid="moe-routing">
            <p
                className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                data-testid="moe-routing-header"
            >
                MoE routing
                {totalExperts !== null && (
                    <span className="ml-1 text-foreground/60">
                        · {totalExperts} experts
                        {activeExperts !== null && ` · top-${activeExperts}`}
                    </span>
                )}
            </p>

            {latest && (
                <div className="space-y-0.5" data-testid="moe-latest-routing">
                    <p className="text-[10px] text-muted-foreground">
                        Latest token{' '}
                        <span className="font-mono text-foreground/70">#{latest.tokenIndex}</span>
                    </p>
                    <ul className="space-y-0.5" data-testid="moe-router-bars">
                        {latest.experts.map((expert, i) => {
                            const pct = expert.normalizedScore * 100;
                            return (
                                <li
                                    key={`${expert.id}-${i}`}
                                    className="flex items-center gap-2 text-[11px]"
                                    data-testid={`moe-router-row-${i}`}
                                >
                                    <span className="w-14 truncate font-mono text-right text-muted-foreground">
                                        Expert {expert.id}
                                    </span>
                                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full bg-indigo-500 transition-all"
                                            style={{ width: `${Math.max(2, pct)}%` }}
                                            data-testid={`moe-router-bar-${i}`}
                                        />
                                    </div>
                                    <span className="w-10 text-right tabular-nums text-muted-foreground">
                                        {pct.toFixed(1)}%
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {utilization.counts.length > 0 && (
                <UtilizationGrid
                    counts={utilization.counts}
                    totalActivations={utilization.totalActivations}
                    routedTokenCount={utilization.routedTokenCount}
                />
            )}
        </div>
    );
}

/**
 * Cumulative-utilization bars: one vertical bar per expert.
 * Bar height is normalized to the most-used expert so a sharply
 * concentrated distribution still looks readable. Title tooltip
 * exposes the precise count on hover.
 */
function UtilizationGrid({
    counts,
    totalActivations,
    routedTokenCount,
}: {
    counts: number[];
    totalActivations: number;
    routedTokenCount: number;
}) {
    const maxCount = counts.reduce((m, c) => (c > m ? c : m), 1);
    return (
        <div className="space-y-1" data-testid="moe-utilization">
            <p className="text-[10px] text-muted-foreground">
                Utilization · {routedTokenCount.toLocaleString()} routed token
                {routedTokenCount === 1 ? '' : 's'} · {totalActivations.toLocaleString()}{' '}
                activations
            </p>
            <div
                className="flex h-10 items-end gap-px rounded-sm border border-border bg-muted/30 p-1"
                role="img"
                aria-label="Expert utilization mini bar chart"
                data-testid="moe-utilization-bars"
            >
                {counts.map((count, id) => {
                    const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    return (
                        <div
                            key={id}
                            className={cn(
                                'flex-1 rounded-t-sm transition-all',
                                count === 0 ? 'bg-muted-foreground/20' : 'bg-indigo-500/70',
                            )}
                            style={{ height: `${Math.max(2, heightPct)}%` }}
                            title={`Expert ${id}: ${count}×`}
                            data-testid={`moe-util-bar-${id}`}
                            data-count={count}
                        />
                    );
                })}
            </div>
        </div>
    );
}
