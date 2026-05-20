import { Head, Link, router, useForm } from '@inertiajs/react';
import { MessagesSquare, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { cn } from '@/lib/utils';

/*
 * /threads (M7 chunk 4).
 *
 * Listing: server-paginated 20 per page. URL is the source of truth
 * for search + filter state; changing a control re-issues a partial
 * Inertia visit that preserves scroll + replaces only the threads
 * prop. Search is debounced ~300ms to keep round-trips low while
 * typing.
 *
 * Per-thread links go to /threads/{id} — which is a ComingSoon
 * placeholder until M7 chunk 5 ships the detail page. Create flow
 * POSTs to /threads which redirects to the same placeholder.
 */

interface ThreadRow {
    id: number;
    title: string | null;
    last_activity_at: string | null;
    run_count: number;
    archived: boolean;
    tags: string[];
}

interface ThreadsIndexProps {
    threads: {
        data: ThreadRow[];
        current_page: number;
        last_page: number;
        total: number;
        per_page: number;
    };
    filters: {
        q: string;
        archived: 'false' | 'true' | 'all';
        tag: string;
    };
    available_tags: string[];
}

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

export default function ThreadsIndex({ threads, filters, available_tags }: ThreadsIndexProps) {
    // Local search state for debouncing; the URL stays the source of
    // truth (server filters off `filters.q`).
    const [searchInput, setSearchInput] = useState(filters.q);
    const initialMount = useRef(true);

    // useCallback so the debounce effect below has a stable reference
    // — the lint rule `react-hooks/immutability` flags non-stable
    // handlers used inside effects. Declared BEFORE the effect that
    // references it.
    const visitWithFilters = useCallback(
        (override: Partial<ThreadsIndexProps['filters']>) => {
            const next = {
                q: override.q ?? filters.q,
                archived: override.archived ?? filters.archived,
                tag: override.tag ?? filters.tag,
            };
            // Strip empty values from the URL for a cleaner permalink.
            const params: Record<string, string> = {};
            if (next.q) params.q = next.q;
            if (next.archived !== 'false') params.archived = next.archived;
            if (next.tag) params.tag = next.tag;

            router.get('/threads', params, {
                preserveScroll: true,
                preserveState: true,
                replace: true,
            });
        },
        [filters.q, filters.archived, filters.tag],
    );

    useEffect(() => {
        // Skip the first render so we don't fire a redundant request
        // on mount (URL already matches state).
        if (initialMount.current) {
            initialMount.current = false;
            return;
        }
        const handle = setTimeout(() => {
            visitWithFilters({ q: searchInput });
        }, 300);
        return () => clearTimeout(handle);
        // visitWithFilters identity is stable across renders that don't
        // change the filter triple; including it would also cause the
        // debounce to reset when other filters change, which is the
        // wrong behavior. Search-input is the only trigger we want.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput]);

    const clearFilters = () => {
        setSearchInput('');
        router.get('/threads', {}, { preserveScroll: true, preserveState: true, replace: true });
    };

    const hasActiveFilters = filters.q !== '' || filters.archived !== 'false' || filters.tag !== '';
    const isEmpty = threads.data.length === 0;
    const isFilteredEmpty = isEmpty && hasActiveFilters;

    const createForm = useForm({});
    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        createForm.post('/threads');
    };

    return (
        <>
            <Head title="Threads" />
            <AppLayout title="Threads">
                <div className="p-6 md:p-8 max-w-5xl space-y-6">
                    <header className="flex items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Threads</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {threads.total} {threads.total === 1 ? 'thread' : 'threads'}
                                {hasActiveFilters && ' matching your filters'}
                            </p>
                        </div>
                        <form onSubmit={handleCreate}>
                            <Button
                                type="submit"
                                disabled={createForm.processing}
                                data-testid="create-thread"
                            >
                                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                                New thread
                            </Button>
                        </form>
                    </header>

                    <section
                        aria-label="Filters"
                        className="flex flex-wrap items-center gap-3"
                        data-testid="filters"
                    >
                        <div className="relative flex-1 min-w-[200px]">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder="Search by title"
                                className="pl-9"
                                aria-label="Search threads"
                                data-testid="search-input"
                            />
                        </div>

                        <div
                            className="flex rounded-md border border-border"
                            role="tablist"
                            aria-label="Archive filter"
                            data-testid="archive-toggle"
                        >
                            {(['false', 'all', 'true'] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="tab"
                                    aria-selected={filters.archived === value}
                                    onClick={() => visitWithFilters({ archived: value })}
                                    className={cn(
                                        'px-3 py-2 text-xs first:rounded-l-md last:rounded-r-md transition-colors',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                        filters.archived === value
                                            ? 'bg-accent text-accent-foreground'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                                    )}
                                >
                                    {value === 'false'
                                        ? 'Active'
                                        : value === 'true'
                                          ? 'Archived'
                                          : 'All'}
                                </button>
                            ))}
                        </div>

                        {available_tags.length > 0 && (
                            <select
                                value={filters.tag}
                                onChange={(e) => visitWithFilters({ tag: e.target.value })}
                                aria-label="Filter by tag"
                                data-testid="tag-filter"
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                <option value="">All tags</option>
                                {available_tags.map((tag) => (
                                    <option key={tag} value={tag}>
                                        {tag}
                                    </option>
                                ))}
                            </select>
                        )}

                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearFilters}
                                data-testid="clear-filters"
                            >
                                <X className="mr-1 h-3 w-3" aria-hidden="true" />
                                Clear
                            </Button>
                        )}
                    </section>

                    {isEmpty && isFilteredEmpty && <EmptyFiltered onClear={clearFilters} />}
                    {isEmpty && !isFilteredEmpty && <EmptyAllThreads />}

                    {!isEmpty && (
                        <ul className="space-y-2" data-testid="threads-list">
                            {threads.data.map((thread) => (
                                <li key={thread.id}>
                                    <Card>
                                        <CardContent className="p-0">
                                            <Link
                                                href={`/threads/${thread.id}`}
                                                className="block p-4 hover:bg-accent/30 transition-colors"
                                            >
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate font-medium">
                                                            {thread.title || 'Untitled thread'}
                                                        </p>
                                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                                            {thread.run_count} run
                                                            {thread.run_count === 1
                                                                ? ''
                                                                : 's'} ·{' '}
                                                            {formatRelative(
                                                                thread.last_activity_at,
                                                            )}
                                                            {thread.archived && ' · archived'}
                                                        </p>
                                                    </div>
                                                    {thread.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {thread.tags.slice(0, 3).map((tag) => (
                                                                <span
                                                                    key={tag}
                                                                    className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                                                                >
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </Link>
                                        </CardContent>
                                    </Card>
                                </li>
                            ))}
                        </ul>
                    )}

                    {threads.last_page > 1 && (
                        <Pagination
                            currentPage={threads.current_page}
                            lastPage={threads.last_page}
                            filters={filters}
                        />
                    )}
                </div>
            </AppLayout>
        </>
    );
}

function EmptyAllThreads() {
    return (
        <Card className="border-dashed bg-card/40 text-center" data-testid="empty-all">
            <CardContent className="py-12 flex flex-col items-center gap-3">
                <MessagesSquare className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <div className="space-y-1">
                    <p className="font-medium">No threads yet</p>
                    <p className="text-sm text-muted-foreground">
                        Start one to submit your first prompt. Threads are how LLM-Viz keeps related
                        runs grouped together.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

function EmptyFiltered({ onClear }: { onClear: () => void }) {
    return (
        <Card className="border-dashed bg-card/40 text-center" data-testid="empty-filtered">
            <CardContent className="py-10 flex flex-col items-center gap-3">
                <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <div className="space-y-1">
                    <p className="font-medium">No threads match your filters</p>
                    <p className="text-sm text-muted-foreground">
                        Try a different search term, or clear the filters to see everything.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={onClear}>
                    Clear filters
                </Button>
            </CardContent>
        </Card>
    );
}

function Pagination({
    currentPage,
    lastPage,
    filters,
}: {
    currentPage: number;
    lastPage: number;
    filters: ThreadsIndexProps['filters'];
}) {
    const buildHref = (page: number) => {
        const params = new URLSearchParams();
        if (filters.q) params.set('q', filters.q);
        if (filters.archived !== 'false') params.set('archived', filters.archived);
        if (filters.tag) params.set('tag', filters.tag);
        if (page > 1) params.set('page', String(page));
        const qs = params.toString();
        return qs ? `/threads?${qs}` : '/threads';
    };

    return (
        <nav
            aria-label="Pagination"
            className="flex items-center justify-between border-t border-border pt-4"
            data-testid="pagination"
        >
            <Button asChild variant="ghost" size="sm" disabled={currentPage === 1}>
                <Link href={buildHref(currentPage - 1)} preserveScroll>
                    Previous
                </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
                Page {currentPage} of {lastPage}
            </p>
            <Button asChild variant="ghost" size="sm" disabled={currentPage === lastPage}>
                <Link href={buildHref(currentPage + 1)} preserveScroll>
                    Next
                </Link>
            </Button>
        </nav>
    );
}
