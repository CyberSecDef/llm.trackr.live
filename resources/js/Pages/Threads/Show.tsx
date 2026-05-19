import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    Archive,
    ArchiveRestore,
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    KeyRound,
    Pencil,
    Radio,
    Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { lazy, Suspense } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import { useEventPlayback, type PlaybackSpeed } from '@/hooks/useEventPlayback';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useRunStream } from '@/hooks/useRunStream';
import { computeStreamMetrics } from '@/lib/streamMetrics';
import LogitsDistribution from '@/Components/LogitsDistribution';
import MoERouting from '@/Components/MoERouting';
import PlaybackControls from '@/Components/PlaybackControls';
import ModelMetadataCard from '@/Components/ModelMetadataCard';
import ModelPicker, { type PickerModel } from '@/Components/ModelPicker';
import ParameterControls, {
    PARAM_DEFAULTS,
    type ParameterValues,
} from '@/Components/ParameterControls';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { Textarea } from '@/Components/ui/textarea';
import type { RunEvent } from '@/types/runs';

// M8: lazy-load the Three.js / D3 viz so its bundle (~600KB) is
// only fetched when a user actually views a thread.
const VizPane = lazy(() => import('@/Components/Viz/VizPane'));
// M8 chunk 7: separate lazy import for the embedding scene so its
// vocab data only loads when the user toggles to that tab.
const EmbeddingScene = lazy(() => import('@/Components/Viz/EmbeddingScene'));
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/Components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/*
 * /threads/{id} (M7 chunk 5).
 *
 * Three regions vertically:
 *  - Header: title (inline-editable), archived badge, action menu
 *    (Archive/Unarchive, Edit title, Delete with confirm).
 *  - Transcript: read-only list of runs in sequence_in_thread order.
 *    Each run renders as a "user prompt → assistant output" pair with
 *    a status badge. Live streaming integration (useRunStream into a
 *    right pane) lands in chunk 6.
 *  - Footer: prompt input + native model <select> + Submit. The full
 *    prompt-input panel (autosize, token counter, context warning)
 *    lands in chunks 6–8; this is the bare-minimum so the page is
 *    usable end-to-end.
 *
 * Empty states cover: no API key (link to /api-keys), no usable
 * models (the user has a key but the registry has nothing for that
 * vendor — rare but possible).
 */

interface RunRow {
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
    model_id: number;
    created_at: string | null;
    // M8 chunk 2: derived from the run's model snapshot, used by VizPane.
    total_layers: number | null;
    architecture_type: string | null;
}

// The thread.show controller hands us the full model metadata; type is
// re-exported from ModelPicker so we stay in sync with the picker's
// expectations.
type UsableModel = PickerModel;

interface ThreadShowProps {
    thread: {
        id: number;
        title: string | null;
        archived: boolean;
        tags: string[];
        last_activity_at: string | null;
        created_at: string | null;
        default_model_id: number | null;
    };
    runs: RunRow[];
    usable_models: UsableModel[];
    has_api_keys: boolean;
}

const STATUS_LABEL: Record<RunRow['status'], string> = {
    pending: 'Pending',
    streaming: 'Streaming',
    complete: 'Complete',
    error: 'Error',
};
const STATUS_CLASSES: Record<RunRow['status'], string> = {
    pending: 'bg-muted text-muted-foreground',
    streaming: 'bg-blue-500/15 text-blue-300',
    complete: 'bg-emerald-500/15 text-emerald-300',
    error: 'bg-destructive/20 text-destructive-foreground',
};

/**
 * Pick the latest run in non-terminal status — that's the one a live
 * stream pane should subscribe to. Returns null when nothing is
 * actively in flight.
 */
function findActiveRun(runs: RunRow[]): RunRow | null {
    // runs prop is ordered by sequence_in_thread asc (per the
    // controller), so the latest by ID is the last one.
    for (let i = runs.length - 1; i >= 0; i--) {
        const run = runs[i];
        if (run.status === 'pending' || run.status === 'streaming') {
            return run;
        }
    }
    return null;
}

export default function ThreadShow({ thread, runs, usable_models, has_api_keys }: ThreadShowProps) {
    const activeRun = findActiveRun(runs);
    // Lifted up so both LiveStreamPane and VizPane share one
    // subscription (no double event handlers, no double Echo
    // channels). View toggle just swaps the renderer.
    const stream = useRunStream(activeRun?.id ?? null);
    // M8 chunk 8: playback engine slices the event stream — every
    // viz + the live transcript text consumes `visibleEvents` so
    // pause/step/speed apply uniformly.
    const playback = useEventPlayback(stream.events);

    return (
        <>
            <Head title={thread.title || `Thread #${thread.id}`} />
            <AppLayout title="Thread">
                <div className="p-6 md:p-8 max-w-7xl">
                    <BackLink />
                    {/* Desktop: 3-col grid with transcript+form spanning 2,
                        viz pane on the right. Mobile: single column. */}
                    <div className="mt-4 grid gap-6 lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-6 min-w-0">
                            <ThreadHeader thread={thread} />
                            <Transcript
                                runs={runs}
                                events={playback.visibleEvents}
                                usableModels={usable_models}
                            />
                            <PromptFooter
                                threadId={thread.id}
                                usableModels={usable_models}
                                hasApiKeys={has_api_keys}
                                defaultModelId={thread.default_model_id}
                            />
                        </div>
                        <aside
                            aria-label="Run visualization"
                            className="lg:sticky lg:top-6 lg:self-start space-y-2"
                            data-testid="viz-aside"
                        >
                            <PlaybackControls
                                playing={playback.playing}
                                speed={playback.speed}
                                cursor={playback.cursor}
                                totalEvents={playback.totalEvents}
                                isLive={playback.isLive}
                                onToggle={playback.toggle}
                                onStep={playback.step}
                                onSpeedChange={(s: PlaybackSpeed) => playback.setSpeed(s)}
                                onJumpToLive={playback.jumpToLive}
                            />
                            <RightPane
                                activeRun={activeRun}
                                events={playback.visibleEvents}
                                status={stream.status}
                                transport={stream.transport}
                                disabled={stream.disabled}
                            />
                        </aside>
                    </div>
                </div>
            </AppLayout>
        </>
    );
}

/**
 * RightPane (M8 chunk 1) — viewer-toggle wrapper. Defaults to the
 * VizPane (M8); a "Debug" toggle in the header swaps to the chunk-6b
 * LiveStreamPane (event JSON list). Reduced-motion users get the
 * debug view automatically and can't switch to the animated viz.
 */
function RightPane({
    activeRun,
    events,
    status,
    transport,
    disabled,
}: {
    activeRun: RunRow | null;
    events: RunEvent[];
    status: 'idle' | 'streaming' | 'complete' | 'errored';
    transport: 'websocket' | 'sse' | 'none';
    disabled: boolean;
}) {
    const reducedMotion = useReducedMotion();
    const [mode, setMode] = useState<'viz' | 'embeddings' | 'debug'>(
        reducedMotion ? 'debug' : 'viz',
    );

    // If the user's reduced-motion preference flips on while viz is
    // active, automatically fall back to debug. We don't auto-flip
    // back to viz when it flips off — the user can do that manually
    // via the toggle. setState-in-effect is correct here: we're
    // syncing local state with an external system (the OS-level
    // media query), not deriving from props. Embeddings tab stays
    // available under reduced-motion because the cloud's auto-orbit
    // pauses once a spotlight is active.
    useEffect(() => {
        if (reducedMotion && mode === 'viz') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMode('debug');
        }
    }, [reducedMotion, mode]);

    // Terminal-status reload — fires regardless of which view is
    // active so the transcript on the left always refreshes with the
    // final output. Originally lived inside LiveStreamPane (M7 chunk
    // 6b); lifted to RightPane in M8 chunk 1 because the viz can be
    // the visible view at terminal time.
    useEffect(() => {
        if (status === 'complete' || status === 'errored') {
            const handle = setTimeout(() => {
                router.reload({ only: ['runs'] });
            }, 400);
            return () => clearTimeout(handle);
        }
    }, [status]);

    const totalLayers = activeRun?.total_layers ?? null;
    const architectureType = activeRun?.architecture_type ?? null;

    return (
        <div className="space-y-2">
            <div
                className="flex rounded-md border border-border"
                role="tablist"
                aria-label="Right pane view"
                data-testid="right-pane-toggle"
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'viz'}
                    onClick={() => setMode('viz')}
                    disabled={reducedMotion}
                    title={
                        reducedMotion
                            ? 'Visualization disabled because prefers-reduced-motion is set.'
                            : undefined
                    }
                    className={cn(
                        'flex-1 rounded-l-md px-3 py-1.5 text-xs transition-colors',
                        mode === 'viz'
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                        reducedMotion && 'cursor-not-allowed opacity-50',
                    )}
                    data-testid="view-viz"
                >
                    Visualization
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'embeddings'}
                    onClick={() => setMode('embeddings')}
                    className={cn(
                        'flex-1 border-x border-border px-3 py-1.5 text-xs transition-colors',
                        mode === 'embeddings'
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )}
                    data-testid="view-embeddings"
                >
                    Embeddings
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'debug'}
                    onClick={() => setMode('debug')}
                    className={cn(
                        'flex-1 rounded-r-md px-3 py-1.5 text-xs transition-colors',
                        mode === 'debug'
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )}
                    data-testid="view-debug"
                >
                    Debug
                </button>
            </div>

            {mode === 'viz' && (
                <Suspense
                    fallback={
                        <Card data-testid="viz-loading">
                            <CardContent className="p-6 text-center text-xs text-muted-foreground">
                                Loading visualization…
                            </CardContent>
                        </Card>
                    }
                >
                    <VizPane
                        events={events}
                        status={status}
                        totalLayers={totalLayers}
                        architectureType={architectureType}
                    />
                </Suspense>
            )}
            {mode === 'embeddings' && (
                <Suspense
                    fallback={
                        <Card data-testid="embeddings-loading">
                            <CardContent className="p-6 text-center text-xs text-muted-foreground">
                                Loading embedding scatter…
                            </CardContent>
                        </Card>
                    }
                >
                    <EmbeddingScene events={events} status={status} />
                </Suspense>
            )}
            {mode === 'debug' && (
                <LiveStreamPane
                    activeRun={activeRun}
                    events={events}
                    status={status}
                    transport={transport}
                    disabled={disabled}
                />
            )}
        </div>
    );
}

function BackLink() {
    return (
        <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/threads">
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                All threads
            </Link>
        </Button>
    );
}

function ThreadHeader({ thread }: { thread: ThreadShowProps['thread'] }) {
    const [editing, setEditing] = useState(false);
    const titleForm = useForm({ title: thread.title ?? '' });

    const submitTitle = (e: FormEvent) => {
        e.preventDefault();
        titleForm.patch(`/threads/${thread.id}`, {
            onSuccess: () => setEditing(false),
        });
    };

    const toggleArchive = () => {
        router.patch(
            `/threads/${thread.id}`,
            { archived: !thread.archived },
            { preserveScroll: true },
        );
    };

    const destroy = () => {
        router.delete(`/threads/${thread.id}`);
    };

    return (
        <header className="space-y-3" data-testid="thread-header">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                    {editing ? (
                        <form
                            onSubmit={submitTitle}
                            className="flex items-center gap-2"
                            data-testid="title-form"
                        >
                            <Input
                                value={titleForm.data.title}
                                onChange={(e) => titleForm.setData('title', e.target.value)}
                                aria-label="Thread title"
                                // The autofocus is intentional: the user just
                                // clicked an explicit "edit title" button, so
                                // moving focus into the field is the expected
                                // next interaction.
                                // eslint-disable-next-line jsx-a11y/no-autofocus
                                autoFocus
                                maxLength={200}
                            />
                            <Button type="submit" size="sm" disabled={titleForm.processing}>
                                Save
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    titleForm.setData('title', thread.title ?? '');
                                    setEditing(false);
                                }}
                            >
                                Cancel
                            </Button>
                        </form>
                    ) : (
                        <h1 className="text-2xl font-bold tracking-tight truncate">
                            {thread.title || 'Untitled thread'}
                        </h1>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                        {thread.archived && (
                            <span className="mr-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                                archived
                            </span>
                        )}
                        Created{' '}
                        {thread.created_at ? new Date(thread.created_at).toLocaleString() : '—'}
                    </p>
                </div>

                {!editing && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(true)}
                            data-testid="edit-title"
                        >
                            <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                            Title
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleArchive}
                            data-testid="toggle-archive"
                        >
                            {thread.archived ? (
                                <>
                                    <ArchiveRestore className="mr-1 h-3 w-3" aria-hidden="true" />
                                    Unarchive
                                </>
                            ) : (
                                <>
                                    <Archive className="mr-1 h-3 w-3" aria-hidden="true" />
                                    Archive
                                </>
                            )}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    data-testid="delete-trigger"
                                >
                                    <Trash2 className="mr-1 h-3 w-3" aria-hidden="true" />
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this thread?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This permanently removes the thread and all of its runs.
                                        This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={destroy}
                                        data-testid="delete-confirm"
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        Delete thread
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}
            </div>
        </header>
    );
}

function Transcript({
    runs,
    events,
    usableModels,
}: {
    runs: RunRow[];
    events: RunEvent[];
    usableModels: UsableModel[];
}) {
    if (runs.length === 0) {
        return (
            <Card className="border-dashed bg-card/40 text-center" data-testid="empty-transcript">
                <CardContent className="py-10">
                    <p className="text-sm text-muted-foreground">
                        No prompts yet. Type your first one below to get started.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <section className="space-y-4" data-testid="transcript">
            {runs.map((run) => {
                const isLive = run.status === 'pending' || run.status === 'streaming';
                const model = isLive
                    ? (usableModels.find((m) => m.id === run.model_id) ?? null)
                    : null;
                return (
                    <Card key={run.id} data-testid={`run-${run.id}`}>
                        <CardContent className="space-y-3 p-4">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                    Run #{run.sequence_in_thread}
                                </p>
                                <span
                                    className={cn(
                                        'rounded-full px-2 py-0.5 text-xs',
                                        STATUS_CLASSES[run.status],
                                    )}
                                >
                                    {STATUS_LABEL[run.status]}
                                </span>
                            </div>

                            {run.prompt !== null && (
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        You
                                    </p>
                                    <p className="whitespace-pre-wrap text-sm">{run.prompt}</p>
                                </div>
                            )}

                            {isLive ? (
                                <LiveRunBody run={run} events={events} model={model} />
                            ) : (
                                <StaticRunBody run={run} />
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </section>
    );
}

/**
 * StaticRunBody — the post-stream rendering of a completed or
 * errored run. Reads from the server-side row only.
 */
function StaticRunBody({ run }: { run: RunRow }) {
    return (
        <>
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
        </>
    );
}

/**
 * LiveRunBody (M8 chunk 4) — replaces the empty Assistant block on a
 * streaming/pending run with live token text, a blinking cursor, and
 * a metrics strip (output tokens · TPS · cost · context bar).
 *
 * All derivations are pure (see `lib/streamMetrics.ts`); this component
 * only owns layout. When the run completes the parent re-renders this
 * row through `StaticRunBody` via the 400ms terminal-status reload.
 */
function LiveRunBody({
    run,
    events,
    model,
}: {
    run: RunRow;
    events: RunEvent[];
    model: UsableModel | null;
}) {
    const metrics = computeStreamMetrics({
        events,
        inputTokens: run.input_tokens,
        contextLength: model?.context_length ?? null,
        pricing: model
            ? {
                  pricing_input_per_million: model.pricing_input_per_million ?? null,
                  pricing_output_per_million: model.pricing_output_per_million ?? null,
              }
            : null,
    });

    return (
        <>
            <div className="space-y-1" data-testid="live-assistant-block">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Assistant
                </p>
                <p className="whitespace-pre-wrap text-sm" data-testid="live-assistant-text">
                    {metrics.liveText}
                    <span
                        className="ml-0.5 inline-block animate-pulse text-foreground/70"
                        aria-hidden="true"
                        data-testid="live-cursor"
                    >
                        ▍
                    </span>
                </p>
            </div>

            {/* M8 chunk 5b: top-K logits when the vendor provides them.
                Returns null when no logprobs are available — no
                placeholder, no fabrication (chunk-5 decision). */}
            <LogitsDistribution events={events} />

            {/* M8 chunk 6: router scores + expert utilization. Only
                mounted for MoE models — dense runs skip the component
                entirely (no placeholder, mirrors the chunk-5b decision). */}
            {model?.architecture_type === 'moe' && (
                <MoERouting
                    events={events}
                    totalExperts={model.moe_experts ?? null}
                    activeExperts={model.moe_active_experts ?? null}
                />
            )}

            <LiveMetricsStrip metrics={metrics} />
        </>
    );
}

function LiveMetricsStrip({ metrics }: { metrics: ReturnType<typeof computeStreamMetrics> }) {
    const pctRaw =
        metrics.contextBudget !== null && metrics.contextBudget > 0
            ? (metrics.contextUsed / metrics.contextBudget) * 100
            : null;
    const pct = pctRaw !== null ? Math.min(100, pctRaw) : null;
    const fillClass =
        pct === null
            ? 'bg-primary'
            : pct >= 100
              ? 'bg-destructive'
              : pct >= 80
                ? 'bg-amber-500'
                : 'bg-primary';

    return (
        <div className="space-y-1.5" data-testid="live-metrics">
            <p className="text-xs text-muted-foreground" data-testid="live-numbers">
                {metrics.outputTokens.toLocaleString()} out
                {metrics.tps !== null ? ` · ${metrics.tps.toFixed(1)} t/s` : ' · — t/s'}
                {metrics.costSoFar !== null ? ` · $${metrics.costSoFar.toFixed(4)}` : ''}
            </p>
            {pct !== null && (
                <div className="space-y-0.5" data-testid="live-context-bar">
                    <p className="text-[10px] text-muted-foreground">
                        {metrics.contextUsed.toLocaleString()} /{' '}
                        {metrics.contextBudget?.toLocaleString()} ctx
                        <span className="ml-1 text-muted-foreground/70">({pct.toFixed(0)}%)</span>
                    </p>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn('h-full transition-all', fillClass)}
                            style={{ width: `${Math.max(2, pct)}%` }}
                            data-testid="live-context-bar-fill"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function PromptFooter({
    threadId,
    usableModels,
    hasApiKeys,
    defaultModelId,
}: {
    threadId: number;
    usableModels: UsableModel[];
    hasApiKeys: boolean;
    defaultModelId: number | null;
}) {
    if (!hasApiKeys) {
        return (
            <Card className="border-amber-500/40 bg-amber-500/5" data-testid="no-api-key-footer">
                <CardContent className="flex items-center gap-3 p-4">
                    <KeyRound className="h-5 w-5 text-amber-400 flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">
                            Add an API key to start submitting prompts.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Bring-your-own-key — pick a vendor and paste the credential.
                        </p>
                    </div>
                    <Button asChild size="sm">
                        <Link href="/api-keys">API Keys</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (usableModels.length === 0) {
        return (
            <Card className="border-amber-500/40 bg-amber-500/5" data-testid="no-usable-models">
                <CardContent className="p-4 text-sm">
                    You have an API key on file but the registry doesn&apos;t have any models for
                    your vendor(s). An admin can refresh the registry from the Models page.
                </CardContent>
            </Card>
        );
    }

    return (
        <PromptForm
            threadId={threadId}
            usableModels={usableModels}
            defaultModelId={defaultModelId}
        />
    );
}

interface PromptPreviewResponse {
    history: Array<{ role: string; content: string }>;
    token_counts: { history: number; prompt: number; reserved: number; total: number };
    budget: number;
    fits: boolean;
    over_by: number;
    model: { id: number; vendor: string; name: string; context_length: number | null };
}

/**
 * useAutosizeTextarea — drives the textarea's height from its
 * scrollHeight on every change. Plain JS; no library.
 */
function useAutosizeTextarea(value: string) {
    const ref = useRef<HTMLTextAreaElement | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Reset to a small height first so scrollHeight reports the
        // content's natural size (not the previously-set height).
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 480)}px`;
    }, [value]);
    return ref;
}

/**
 * useDebouncedPreview — POSTs to /threads/{id}/preview on a 400ms
 * debounce as the user types. Tracks loading + error state; aborts
 * any in-flight request when inputs change.
 */
function useDebouncedPreview(
    threadId: number,
    prompt: string,
    modelId: number,
    maxTokens: number | undefined,
): { preview: PromptPreviewResponse | null; loading: boolean } {
    const [preview, setPreview] = useState<PromptPreviewResponse | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!modelId) {
            // Edge case: no model selected (shouldn't normally happen
            // — PromptForm picks the first usable model at mount).
            // setState-in-effect is documented; we're clearing stale
            // preview state for a degraded input rather than a render-
            // driven derivation.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPreview(null);
            return;
        }
        const controller = new AbortController();

        setLoading(true);
        const handle = setTimeout(() => {
            // CSRF + cookies handled automatically by same-origin fetch.
            const csrf =
                document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
            fetch(`/threads/${threadId}/preview`, {
                method: 'POST',
                credentials: 'same-origin',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrf,
                },
                body: JSON.stringify({
                    prompt,
                    model_id: modelId,
                    parameters: maxTokens !== undefined ? { max_tokens: maxTokens } : {},
                }),
            })
                .then((r) => (r.ok ? r.json() : null))
                .then((data: PromptPreviewResponse | null) => {
                    if (data) setPreview(data);
                    setLoading(false);
                })
                .catch((err) => {
                    if (err.name !== 'AbortError') setLoading(false);
                });
        }, 400);

        return () => {
            clearTimeout(handle);
            controller.abort();
        };
        // max_tokens is also a re-run trigger so the budget bar
        // updates when the chunk-8 ParameterControls user adjusts
        // the reserve.
    }, [threadId, prompt, modelId, maxTokens]);

    return { preview, loading };
}

function PromptForm({
    threadId,
    usableModels,
    defaultModelId,
}: {
    threadId: number;
    usableModels: UsableModel[];
    defaultModelId: number | null;
}) {
    // Pick the thread's default model, else the first usable one.
    const initialModelId =
        defaultModelId && usableModels.find((m) => m.id === defaultModelId)
            ? defaultModelId
            : (usableModels[0]?.id ?? 0);

    const form = useForm<{
        prompt: string;
        model_id: number;
        parameters: ParameterValues;
    }>({
        prompt: '',
        model_id: initialModelId,
        parameters: { ...PARAM_DEFAULTS, seed: null },
    });

    const textareaRef = useAutosizeTextarea(form.data.prompt);
    const { preview } = useDebouncedPreview(
        threadId,
        form.data.prompt,
        form.data.model_id,
        form.data.parameters.max_tokens,
    );
    const [historyOpen, setHistoryOpen] = useState(false);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`/threads/${threadId}/runs`, {
            onSuccess: () => form.reset('prompt'),
        });
    };

    const overBudget = preview ? !preview.fits : false;
    const submitDisabled = form.processing || form.data.prompt.trim() === '' || overBudget;

    // Selected model object — fed to the metadata card so it can show
    // the full attribute grid for the user's current choice.
    const selectedModel = usableModels.find((m) => m.id === form.data.model_id) ?? null;

    return (
        <Card data-testid="prompt-form">
            <CardContent className="space-y-3 p-4">
                {preview && preview.history.length > 0 && (
                    <HistoryPreview
                        history={preview.history}
                        open={historyOpen}
                        onToggle={() => setHistoryOpen((v) => !v)}
                    />
                )}

                <form onSubmit={submit} className="space-y-3">
                    <Textarea
                        ref={textareaRef}
                        value={form.data.prompt}
                        onChange={(e) => form.setData('prompt', e.target.value)}
                        placeholder="Type your prompt…"
                        aria-label="Prompt"
                        data-testid="prompt-textarea"
                        rows={4}
                        // Autosize hook clamps to 480px; rows is just the
                        // starting/minimum visible height.
                        className="resize-none"
                    />
                    {form.errors.prompt && (
                        <p className="text-xs text-destructive">{form.errors.prompt}</p>
                    )}

                    {preview && <BudgetIndicator preview={preview} />}

                    <div className="flex items-center gap-3 flex-wrap">
                        {/*
                            Span instead of <label> because the
                            ModelPicker is a combobox (button trigger
                            + listbox in a portaled popover), and the
                            HTML label-for pattern doesn't apply.
                            ModelPicker carries its own aria-label.
                        */}
                        <span className="text-xs text-muted-foreground">Model</span>
                        <ModelPicker
                            models={usableModels}
                            value={form.data.model_id}
                            onChange={(id) => form.setData('model_id', id)}
                            data-testid="model-select"
                        />
                        <div className="flex-1" />
                        <Button type="submit" disabled={submitDisabled} data-testid="submit-prompt">
                            Submit
                        </Button>
                    </div>
                </form>

                {selectedModel && <ModelMetadataCard model={selectedModel} />}

                <ParameterControls
                    value={form.data.parameters}
                    onChange={(next) => form.setData('parameters', next)}
                    supported={selectedModel?.supported_params ?? null}
                    maxTokensCeiling={selectedModel?.context_length ?? null}
                />
            </CardContent>
        </Card>
    );
}

function HistoryPreview({
    history,
    open,
    onToggle,
}: {
    history: Array<{ role: string; content: string }>;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="rounded-md border border-border bg-muted/30" data-testid="history-preview">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center gap-2 p-2 text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={open}
            >
                {open ? (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                ) : (
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                )}
                Conversation history ({history.length} {history.length === 1 ? 'turn' : 'turns'})
            </button>
            {open && (
                <div className="space-y-2 px-3 pb-3 pt-1" data-testid="history-preview-body">
                    {history.map((turn, idx) => (
                        <div key={idx} className="space-y-0.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {turn.role}
                            </p>
                            <pre className="whitespace-pre-wrap text-xs font-mono text-foreground/90">
                                {turn.content}
                            </pre>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function BudgetIndicator({ preview }: { preview: PromptPreviewResponse }) {
    // Skip when the model has no recorded context_length (budget=0
    // == "unlimited / unknown" from ContextBudgetCalculator).
    if (preview.budget <= 0) {
        return (
            <p className="text-xs text-muted-foreground" data-testid="token-counts">
                {preview.token_counts.total.toLocaleString()} tokens
                <span className="ml-1 text-muted-foreground/70">
                    ({preview.token_counts.history.toLocaleString()} history ·{' '}
                    {preview.token_counts.prompt.toLocaleString()} prompt)
                </span>
            </p>
        );
    }

    const percent = Math.min(100, (preview.token_counts.total / preview.budget) * 100);
    const isWarn = percent >= 80 && percent < 100;
    const isOver = !preview.fits;
    const fillClass = isOver ? 'bg-destructive' : isWarn ? 'bg-amber-500' : 'bg-primary';

    return (
        <div className="space-y-1" data-testid="budget-indicator">
            <div className="flex items-center justify-between text-xs">
                <p data-testid="token-counts">
                    {preview.token_counts.total.toLocaleString()} /{' '}
                    {preview.budget.toLocaleString()} tokens
                    <span className="ml-1 text-muted-foreground/70">
                        ({preview.token_counts.history.toLocaleString()} history ·{' '}
                        {preview.token_counts.prompt.toLocaleString()} prompt)
                    </span>
                </p>
                {isOver && (
                    <span
                        className="flex items-center gap-1 text-destructive"
                        data-testid="over-budget"
                    >
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        {preview.over_by.toLocaleString()} over
                    </span>
                )}
                {isWarn && !isOver && (
                    <span
                        className="flex items-center gap-1 text-amber-500"
                        data-testid="near-budget"
                    >
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        approaching limit
                    </span>
                )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={cn('h-full transition-all', fillClass)}
                    style={{ width: `${Math.max(2, percent)}%` }}
                    data-testid="budget-bar-fill"
                />
            </div>
        </div>
    );
}

/**
 * LiveStreamPane (M7 chunk 6b; M8 chunk 1 took the stream as props).
 * Right-column live view of the currently-active run's broadcast
 * events. The subscription is now lifted to ThreadShow so the viz
 * pane (M8) and this pane share one Echo channel.
 *
 * When the run reaches a terminal status, partial-reloads the page
 * so the transcript on the left picks up the final output_text +
 * token counts; the pane then returns to its empty state until the
 * next submit.
 */
function LiveStreamPane({
    activeRun,
    events,
    status,
    transport,
    disabled,
}: {
    activeRun: RunRow | null;
    events: RunEvent[];
    status: 'idle' | 'streaming' | 'complete' | 'errored';
    transport: 'websocket' | 'sse' | 'none';
    disabled: boolean;
}) {
    // Auto-reload-on-terminal moved up to RightPane in M8 chunk 1
    // so it fires regardless of which view (Viz / Debug) is active.

    if (!activeRun) {
        return (
            <Card className="border-dashed bg-card/30" data-testid="live-empty">
                <CardContent className="p-4 text-center text-xs text-muted-foreground">
                    Submit a prompt to see live token events here.
                </CardContent>
            </Card>
        );
    }

    return (
        <Card data-testid="live-pane">
            <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Run #{activeRun.sequence_in_thread} — live
                    </p>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Radio
                            className={cn(
                                'h-3 w-3',
                                status === 'streaming' && 'text-emerald-400 animate-pulse',
                            )}
                            aria-hidden="true"
                        />
                        {status}
                    </span>
                </div>
                <p className="text-[10px] text-muted-foreground" data-testid="live-transport">
                    transport: {transport}
                </p>
                {disabled && (
                    <p className="text-xs text-amber-400" data-testid="live-transport-unavailable">
                        No realtime transport available. The transcript will refresh once the run
                        completes.
                    </p>
                )}
                <pre
                    className="max-h-[50vh] overflow-auto rounded bg-muted/40 p-2 text-[11px] font-mono leading-relaxed text-foreground/90"
                    data-testid="live-events"
                >
                    {events.length === 0
                        ? '// waiting for events…'
                        : events
                              .map((e) => JSON.stringify({ event: e.event, ...e.payload }, null, 2))
                              .join('\n\n')}
                </pre>
            </CardContent>
        </Card>
    );
}
