import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { BpeToken } from '@/lib/tokenizer';

/*
 * VocabSidebar (M13 chunk 3c + chunk 10) — left-edge persistent UI
 * section showing the (id, string) list of tokens.
 *
 * Chunk 3c populated tokens during Scene 3's BPE animation.
 * Chunk 10 adds the chunk-20 reverse-lookup affordance:
 * `highlightTokenIndex` rings + scrolls the matching row into view.
 *
 * Two highlight modes coexist:
 *   - The "most-recently-revealed" highlight (auto-derived from
 *     `revealedCount - 1`) marks where forward tokenization is
 *     currently. Used during Scene 3.
 *   - The explicit `highlightTokenIndex` overrides that for the
 *     Scene 20 reverse-lookup beat. When set, that row gets the
 *     cyan ring + a smooth scrollIntoView.
 *
 * Per `phase1.md:1031`: "Highlight + scroll-into-view on lookup
 * events from Scene 3 (forward) + Scene 20 (reverse)."
 */

export interface VocabSidebarProps {
    /** All tokens revealed so far. Empty until Scene 3 runs. */
    tokens?: readonly BpeToken[];
    /** How many of `tokens` are visible. The (revealedCount - 1)
     *  index is the implicit highlight (Scene 3's forward beat). */
    revealedCount?: number;
    /** Explicit highlight override for the Scene 20 reverse-lookup
     *  beat. Indexes into `tokens` (NOT into the visible slice). */
    highlightTokenIndex?: number | null;
}

export default function VocabSidebar({
    tokens = [],
    revealedCount = 0,
    highlightTokenIndex = null,
}: VocabSidebarProps) {
    const visible = tokens.slice(0, revealedCount);
    const listRef = useRef<HTMLUListElement>(null);

    // Smooth scrollIntoView when the highlight changes, per the
    // spec's "scroll-into-view on lookup events." `block: 'nearest'`
    // avoids the page-level jump that the default behaviour can
    // trigger; only the sidebar's own scroll container moves.
    useEffect(() => {
        if (highlightTokenIndex === null || highlightTokenIndex < 0) return;
        if (!listRef.current) return;
        const target = listRef.current.querySelector(`[data-vocab-index="${highlightTokenIndex}"]`);
        if (target instanceof HTMLElement) {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [highlightTokenIndex]);

    return (
        <aside
            className="h-full w-44 shrink-0 overflow-y-auto rounded-md border border-border bg-card/40 p-3 text-[10px]"
            aria-label="Vocabulary sidebar"
            data-testid="viz-vocab-sidebar"
        >
            <p className="font-medium uppercase tracking-wider text-muted-foreground">Vocabulary</p>

            {visible.length === 0 ? (
                <p className="mt-2 text-muted-foreground/70 italic">
                    Populated during Scene 3 (BPE tokenization).
                </p>
            ) : (
                <ul
                    ref={listRef}
                    className="mt-2 max-h-[360px] space-y-0.5 overflow-y-auto"
                    data-testid="viz-vocab-list"
                >
                    {visible.map((tok, i) => {
                        const isMostRecent = i === visible.length - 1;
                        const isReverseHighlight =
                            highlightTokenIndex !== null && i === highlightTokenIndex;
                        // Reverse-lookup highlight takes precedence over the
                        // forward "most-recent" marker when both could apply.
                        const showHighlight = isReverseHighlight || isMostRecent;
                        return (
                            <li
                                key={i}
                                className={cn(
                                    'flex items-center justify-between gap-2 rounded px-1.5 py-0.5 font-mono',
                                    showHighlight
                                        ? isReverseHighlight
                                            ? 'bg-emerald-950/40 text-emerald-200 ring-1 ring-emerald-600'
                                            : 'bg-cyan-950/40 text-cyan-200 ring-1 ring-cyan-700'
                                        : 'text-muted-foreground/90',
                                )}
                                data-testid={`viz-vocab-row-${i}`}
                                data-vocab-index={i}
                                data-recent={isMostRecent ? 'true' : 'false'}
                                data-reverse-highlight={isReverseHighlight ? 'true' : 'false'}
                            >
                                <span className="truncate" title={tok.string}>
                                    {tok.string === ' '
                                        ? '·'
                                        : tok.string === '\n'
                                          ? '↵'
                                          : tok.string}
                                </span>
                                <span className="tabular-nums text-foreground/60">{tok.id}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </aside>
    );
}
