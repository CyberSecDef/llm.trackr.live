import { Head, Link } from '@inertiajs/react';
import { ExternalLink, Eye, Play } from 'lucide-react';
import { Card, CardContent } from '@/Components/ui/card';
import { cn } from '@/lib/utils';

/*
 * /share/{token} (M11 chunk 2) — read-only public thread reader.
 *
 * No AppLayout: anonymous viewers shouldn't see the authenticated
 * sidebar / dashboard nav. Custom minimal SharedLayout (inline
 * here) shows the thread title + an "Anonymous view" indicator +
 * a footer link to the about page.
 *
 * Each terminal run gets a Replay button → /share/{token}/runs/{id}/replay
 * (lands in chunk 2's second route + page).
 */

interface SharedRun {
    id: number;
    sequence_in_thread: number;
    status: 'pending' | 'streaming' | 'complete' | 'error';
    prompt: string | null;
    output_text: string | null;
    error_message: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    duration_ms: number | null;
    estimated_cost: number | null;
    created_at: string | null;
    total_layers: number | null;
    architecture_type: string | null;
}

interface SharedThreadProps {
    token: string;
    thread: {
        id: number;
        title: string | null;
        tags: string[];
        last_activity_at: string | null;
        created_at: string | null;
    };
    runs: SharedRun[];
    prompts_redacted: boolean;
}

const STATUS_LABEL: Record<SharedRun['status'], string> = {
    pending: 'Pending',
    streaming: 'Streaming',
    complete: 'Complete',
    error: 'Error',
};
const STATUS_CLASSES: Record<SharedRun['status'], string> = {
    pending: 'bg-muted text-muted-foreground',
    streaming: 'bg-blue-500/15 text-blue-300',
    complete: 'bg-emerald-500/15 text-emerald-300',
    error: 'bg-destructive/20 text-destructive-foreground',
};

export default function SharedThreadShow({
    token,
    thread,
    runs,
    prompts_redacted,
}: SharedThreadProps) {
    return (
        <>
            <Head title={thread.title || 'Shared thread'} />
            <SharedLayout>
                <div className="mx-auto max-w-3xl space-y-4 p-6 md:p-8">
                    <header className="space-y-2" data-testid="shared-header">
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            Anonymous view · shared by the author
                        </p>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {thread.title || 'Untitled thread'}
                        </h1>
                        {thread.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {thread.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        {prompts_redacted && (
                            <p
                                className="text-xs text-amber-500"
                                data-testid="shared-redaction-notice"
                            >
                                The author has prompts disabled — prompt text is shown as
                                <span className="font-mono"> [prompt redacted by author]</span>.
                            </p>
                        )}
                    </header>

                    {runs.length === 0 ? (
                        <Card
                            className="border-dashed bg-card/40 text-center"
                            data-testid="shared-empty"
                        >
                            <CardContent className="py-10">
                                <p className="text-sm text-muted-foreground">
                                    No runs yet on this thread.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <section className="space-y-3" data-testid="shared-transcript">
                            {runs.map((run) => (
                                <RunRow key={run.id} token={token} run={run} />
                            ))}
                        </section>
                    )}
                </div>
            </SharedLayout>
        </>
    );
}

function RunRow({ token, run }: { token: string; run: SharedRun }) {
    const isTerminal = run.status === 'complete' || run.status === 'error';

    return (
        <Card data-testid={`shared-run-${run.id}`}>
            <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Run #{run.sequence_in_thread}</p>
                    <div className="flex items-center gap-2">
                        {isTerminal && (
                            <Link
                                href={`/share/${token}/runs/${run.id}/replay`}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                data-testid={`shared-replay-link-${run.id}`}
                            >
                                <Play className="h-3 w-3" aria-hidden="true" />
                                Replay
                            </Link>
                        )}
                        <span
                            className={cn(
                                'rounded-full px-2 py-0.5 text-xs',
                                STATUS_CLASSES[run.status],
                            )}
                        >
                            {STATUS_LABEL[run.status]}
                        </span>
                    </div>
                </div>

                {run.prompt !== null && (
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            You
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{run.prompt}</p>
                    </div>
                )}

                {run.output_text !== null && (
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Assistant
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{run.output_text}</p>
                    </div>
                )}

                {run.status === 'error' && run.error_message && (
                    <p className="text-xs text-destructive">{run.error_message}</p>
                )}

                {(run.input_tokens !== null || run.output_tokens !== null) && (
                    <p className="text-xs text-muted-foreground">
                        {run.input_tokens ?? 0} in · {run.output_tokens ?? 0} out
                        {run.duration_ms !== null && ` · ${run.duration_ms}ms`}
                        {run.estimated_cost !== null && ` · $${run.estimated_cost.toFixed(4)}`}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * SharedLayout — minimal chrome for the public read-only routes.
 * No sidebar nav (anonymous viewers), just a top bar with the
 * project branding + a bottom-link to the about page (lands in
 * the M11 chunk-4 closeout).
 */
function SharedLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <header
                className="border-b border-border bg-card/40 px-6 py-3"
                data-testid="shared-layout-header"
            >
                <a
                    href="/"
                    className="text-sm font-medium tracking-tight text-foreground/90 hover:text-foreground"
                >
                    llm.trackr.live
                </a>
            </header>
            <main>{children}</main>
            <footer className="border-t border-border px-6 py-4 text-center text-[11px] text-muted-foreground">
                <a
                    href="/"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    data-testid="shared-about-link"
                >
                    What is this?
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
            </footer>
        </div>
    );
}
