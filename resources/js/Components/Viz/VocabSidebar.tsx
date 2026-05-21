import { cn } from '@/lib/utils';
import type { BpeToken } from '@/lib/tokenizer';

/*
 * VocabSidebar (M13 chunk 3c) — left-edge persistent UI section.
 *
 * Chunk 1 was a placeholder. Chunk 3c wires in the live token
 * data: as Scene 3 reveals tokens (one per BPE step) the sidebar
 * shows the running list. The currently-being-revealed token is
 * highlighted in cyan.
 *
 * Per `docs/visualization.md`: "vocabulary sidebar (left) — scrolling
 * list of (id, string) pairs … highlight + scroll-into-view on
 * lookup events from Scene 3."
 *
 * Implementation: takes a `tokens` + `revealedCount` prop. Tokens
 * up to `revealedCount` are visible; the most recently revealed
 * (index `revealedCount - 1`) is highlighted with a cyan ring.
 * Chunk 11 will wire scrollIntoView() as a follow-up; for now we
 * use `max-h-[400px] overflow-y-auto` to keep the list scrollable
 * even when filled.
 */

export interface VocabSidebarProps {
    /** All tokens revealed so far. Empty until Scene 3 runs. */
    tokens?: readonly BpeToken[];
    /** How many of `tokens` are visible. The (revealedCount - 1)
     *  index is highlighted as the "most recent lookup." */
    revealedCount?: number;
}

export default function VocabSidebar({ tokens = [], revealedCount = 0 }: VocabSidebarProps) {
    const visible = tokens.slice(0, revealedCount);

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
                    className="mt-2 max-h-[360px] space-y-0.5 overflow-y-auto"
                    data-testid="viz-vocab-list"
                >
                    {visible.map((tok, i) => {
                        const isRecent = i === visible.length - 1;
                        return (
                            <li
                                key={i}
                                className={cn(
                                    'flex items-center justify-between gap-2 rounded px-1.5 py-0.5 font-mono',
                                    isRecent
                                        ? 'bg-cyan-950/40 text-cyan-200 ring-1 ring-cyan-700'
                                        : 'text-muted-foreground/90',
                                )}
                                data-testid={`viz-vocab-row-${i}`}
                                data-recent={isRecent ? 'true' : 'false'}
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
