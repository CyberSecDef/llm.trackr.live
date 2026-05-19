import { Head, Link, usePage } from '@inertiajs/react';
import { KeyRound, MessagesSquare, Plus } from 'lucide-react';
import type { PageProps } from '@/types';
import AppLayout from '@/Layouts/AppLayout';
import { Button } from '@/Components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/Components/ui/card';

/*
 * /dashboard (M7 chunk 3).
 *
 * Three stat cards (runs, tokens, est. cost) over recent threads.
 * Empty-state guides:
 *   - No API key → top-of-page callout pointing at /api-keys.
 *   - No threads → the recent-threads section shows a "start your
 *     first thread" CTA pointing at /threads.
 *
 * Stats are all-time (per the chunk-3 scope decision); a "this week"
 * filter can land in M9 once date-range UI patterns are established.
 *
 * Recent threads are shown but not yet individually linkable —
 * `/threads/{id}` lands in chunk 5. The section header's "View all"
 * link goes to /threads (placeholder ComingSoon for now; replaced in
 * chunk 4).
 */

interface ThreadSummary {
    id: number;
    title: string | null;
    last_activity_at: string | null;
    run_count: number;
    archived: boolean;
}

interface DashboardProps {
    stats: {
        total_runs: number;
        total_tokens: number;
        total_cost: number;
    };
    recent_threads: ThreadSummary[];
    has_api_keys: boolean;
}

const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
});

function formatRelative(iso: string | null): string {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

export default function Dashboard({ stats, recent_threads, has_api_keys }: DashboardProps) {
    const { auth } = usePage<PageProps>().props;

    return (
        <>
            <Head title="Dashboard" />
            <AppLayout>
                <div className="p-6 md:p-8 max-w-5xl space-y-8">
                    <header>
                        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Welcome back{auth.user?.name ? `, ${auth.user.name}` : ''}.
                        </p>
                    </header>

                    {!has_api_keys && <NoApiKeyCallout />}

                    <section
                        aria-label="Usage statistics"
                        className="grid gap-4 md:grid-cols-3"
                        data-testid="stats-grid"
                    >
                        <StatCard
                            label="Total runs"
                            value={numberFormatter.format(stats.total_runs)}
                            description="Submitted prompts (all status)"
                        />
                        <StatCard
                            label="Tokens generated"
                            value={numberFormatter.format(stats.total_tokens)}
                            description="Input + output across completed runs"
                        />
                        <StatCard
                            label="Estimated cost"
                            value={currencyFormatter.format(stats.total_cost)}
                            description="Sum of vendor pricing × tokens"
                        />
                    </section>

                    <section aria-label="Recent threads" data-testid="recent-threads">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Recent threads</h2>
                            <Button asChild variant="ghost" size="sm">
                                <Link href="/threads">View all</Link>
                            </Button>
                        </div>
                        {recent_threads.length === 0 ? (
                            <EmptyThreads hasApiKeys={has_api_keys} />
                        ) : (
                            <ul className="mt-3 space-y-2" data-testid="recent-threads-list">
                                {recent_threads.map((thread) => (
                                    <li key={thread.id}>
                                        <Card>
                                            <CardContent className="flex items-center justify-between gap-4 p-4">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-medium">
                                                        {thread.title || 'Untitled thread'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {thread.run_count} run
                                                        {thread.run_count === 1 ? '' : 's'} ·{' '}
                                                        {formatRelative(thread.last_activity_at)}
                                                        {thread.archived && ' · archived'}
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </AppLayout>
        </>
    );
}

function StatCard({
    label,
    value,
    description,
}: {
    label: string;
    value: string;
    description: string;
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-xs text-muted-foreground">{description}</p>
            </CardContent>
        </Card>
    );
}

function NoApiKeyCallout() {
    return (
        <Card className="border-amber-500/40 bg-amber-500/5" data-testid="no-api-key-callout">
            <CardHeader className="flex flex-row items-start gap-3">
                <KeyRound
                    className="mt-1 h-5 w-5 text-amber-400 flex-shrink-0"
                    aria-hidden="true"
                />
                <div className="flex-1">
                    <CardTitle className="text-lg">Set up your first API key</CardTitle>
                    <CardDescription className="mt-1">
                        LLM-Viz uses your own vendor API keys (bring-your-own-key). Add one to start
                        submitting runs — you keep full control of which providers see your prompts.
                    </CardDescription>
                </div>
                <Button asChild>
                    <Link href="/api-keys">Add a key</Link>
                </Button>
            </CardHeader>
        </Card>
    );
}

function EmptyThreads({ hasApiKeys }: { hasApiKeys: boolean }) {
    return (
        <Card className="mt-3 border-dashed bg-card/40 text-center" data-testid="empty-threads">
            <CardContent className="py-12 flex flex-col items-center gap-3">
                <MessagesSquare className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <div className="space-y-1">
                    <p className="font-medium">No threads yet</p>
                    <p className="text-sm text-muted-foreground">
                        {hasApiKeys
                            ? 'Start a thread to submit your first prompt.'
                            : 'Once you add an API key, you can start your first thread here.'}
                    </p>
                </div>
                <Button asChild disabled={!hasApiKeys}>
                    <Link href={hasApiKeys ? '/threads' : '/api-keys'}>
                        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                        {hasApiKeys ? 'Start a thread' : 'Add API key first'}
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}
