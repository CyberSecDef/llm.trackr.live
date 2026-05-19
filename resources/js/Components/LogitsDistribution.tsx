import { extractLatestLogprobs } from '@/lib/logitsExtract';
import { cn } from '@/lib/utils';
import type { RunEvent } from '@/types/runs';

/*
 * LogitsDistribution (M8 chunk 5b) — top-K bars for the most-recent
 * token.received event with non-null logprobs.
 *
 * Per chunk-5 decision, the component returns null when no logprobs
 * are available — vendors that don't expose alternatives simply
 * don't see the chart. No placeholder, no fabricated alternatives.
 *
 * Visual treatment:
 *   - chosen token bar: primary (indigo)
 *   - others: muted
 *   - displayed token strings are JSON-stringified so whitespace +
 *     newline tokens (very common at the top of distributions) are
 *     visible. "\n" reads as "\n" rather than a line break.
 *
 * The component is intentionally tiny and reusable — VizPane's
 * layer-detail overlay could embed it too if we ever decide to.
 */

const TOP_K = 10;

interface LogitsDistributionProps {
    events: RunEvent[];
}

export default function LogitsDistribution({ events }: LogitsDistributionProps) {
    const snap = extractLatestLogprobs(events, TOP_K);
    if (!snap) return null;

    return (
        <div className="space-y-1.5" data-testid="logits-distribution">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Top alternatives for{' '}
                <span className="font-mono text-foreground/80">
                    {JSON.stringify(snap.chosenToken)}
                </span>
            </p>
            <ul className="space-y-0.5" data-testid="logits-bars">
                {snap.alternatives.map((alt, i) => {
                    const isChosen = alt.token === snap.chosenToken;
                    const pct = alt.probability * 100;
                    return (
                        <li
                            key={`${alt.token}-${i}`}
                            className="flex items-center gap-2 text-[11px]"
                            data-testid={`logit-row-${i}`}
                            data-chosen={isChosen ? 'true' : 'false'}
                        >
                            <span
                                className={cn(
                                    'w-16 truncate font-mono text-right',
                                    isChosen ? 'text-foreground' : 'text-muted-foreground',
                                )}
                                title={alt.token}
                            >
                                {JSON.stringify(alt.token)}
                            </span>
                            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn(
                                        'h-full transition-all',
                                        isChosen ? 'bg-primary' : 'bg-muted-foreground/40',
                                    )}
                                    style={{ width: `${Math.max(2, pct)}%` }}
                                    data-testid={`logit-bar-${i}`}
                                />
                            </div>
                            <span
                                className={cn(
                                    'w-10 text-right tabular-nums',
                                    isChosen ? 'text-foreground' : 'text-muted-foreground',
                                )}
                            >
                                {pct.toFixed(1)}%
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
