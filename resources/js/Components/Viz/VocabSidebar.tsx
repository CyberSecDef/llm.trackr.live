/*
 * VocabSidebar (M13) — left-edge persistent UI section.
 *
 * Chunk 1 stub: empty list with a heading. Chunk 3 fills it with
 * the scrolling `(id, string)` pairs revealed during BPE
 * tokenization, and chunk 20 highlights rows in reverse for
 * detokenization.
 */
export default function VocabSidebar() {
    return (
        <aside
            className="h-full w-44 border-r border-border bg-card/40 p-3 text-[10px]"
            aria-label="Vocabulary sidebar"
            data-testid="viz-vocab-sidebar"
        >
            <p className="font-medium uppercase tracking-wider text-muted-foreground">Vocabulary</p>
            <p className="mt-2 text-muted-foreground/70 italic">
                Populated during Scene 3 (BPE tokenization).
            </p>
        </aside>
    );
}
