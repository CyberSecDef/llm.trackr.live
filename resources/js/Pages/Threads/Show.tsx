import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    Archive,
    ArchiveRestore,
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Download,
    KeyRound,
    Pencil,
    Play,
    Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import { useEventPlayback, type PlaybackSpeed } from '@/hooks/useEventPlayback';
import { useRunStream } from '@/hooks/useRunStream';
import { computeStreamMetrics } from '@/lib/streamMetrics';
import ExportDownloadMenu from '@/Components/ExportDownloadMenu';
import LogitsDistribution from '@/Components/LogitsDistribution';
import MoERouting from '@/Components/MoERouting';
import PlaybackControls from '@/Components/PlaybackControls';
import ShareMenu from '@/Components/ShareMenu';
import ModelMetadataCard from '@/Components/ModelMetadataCard';
import ModelPicker, { type PickerModel } from '@/Components/ModelPicker';
import ParameterControls, {
    PARAM_DEFAULTS,
    type ParameterValues,
} from '@/Components/ParameterControls';
// M13 chunk 1: replaced the M8 right-pane viz toggle (VizPane +
// EmbeddingScene + Debug tabs) with a single CinematicViz mount.
import CinematicViz from '@/Components/Viz/CinematicViz';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { Textarea } from '@/Components/ui/textarea';
import type { RunEvent } from '@/types/runs';
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
        // M11 chunk 3: share state for the header popover.
        share_token: string | null;
        share_enabled_at: string | null;
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
                    {/* Desktop: 3-col grid. M13 chunk 1 flipped the
                        split — viz takes 2/3 (the new cinematic mount
                        is the primary surface), transcript+prompt take
                        1/3. Mobile: single column. */}
                    <div className="mt-4 grid gap-6 lg:grid-cols-3">
                        <div className="lg:col-span-1 space-y-6 min-w-0">
                            <ThreadHeader thread={thread} />
                            {/* M12 manual-testing UX revision: prompt
                                always at the top, transcript below
                                with newest-run-first. Lets the user
                                submit a follow-up without scrolling
                                past a long transcript. */}
                            <PromptFooter
                                threadId={thread.id}
                                usableModels={usable_models}
                                hasApiKeys={has_api_keys}
                                defaultModelId={thread.default_model_id}
                            />
                            <Transcript
                                threadId={thread.id}
                                runs={runs}
                                events={playback.visibleEvents}
                                usableModels={usable_models}
                            />
                        </div>
                        <aside
                            aria-label="Run visualization"
                            className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start space-y-2"
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
 * RightPane (M13 chunk 1) — single CinematicViz mount. The M8 tab
 * toggle (view-viz / view-embeddings / view-debug) is gone; the
 * cinematic viz handles its own degraded modes (chunk 13 wires
 * those up — for now it just shows a gate-notice banner).
 *
 * The terminal-status reload effect is retained: regardless of
 * what the viz is doing, the transcript on the left needs to
 * refresh from the controller when a run completes / errors so
 * the run row shows the final output text.
 */
function RightPane({
    activeRun,
    events,
    status,
}: {
    activeRun: RunRow | null;
    events: RunEvent[];
    status: 'idle' | 'streaming' | 'complete' | 'errored';
    transport: 'websocket' | 'sse' | 'none';
    disabled: boolean;
}) {
    useEffect(() => {
        if (status === 'complete' || status === 'errored') {
            const handle = setTimeout(() => {
                router.reload({ only: ['runs'] });
            }, 400);
            return () => clearTimeout(handle);
        }
    }, [status]);

    return (
        <CinematicViz
            events={events}
            model={
                activeRun
                    ? {
                          layers: activeRun.total_layers,
                          attention_heads: null,
                          context_length: null,
                          architecture_type: activeRun.architecture_type,
                      }
                    : null
            }
        />
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
                        {/* M9 chunk 5: thread JSON export. Plain anchor —
                            browser respects Content-Disposition to save
                            thread-{id}.json instead of routing through
                            Inertia. */}
                        <Button asChild variant="outline" size="sm" data-testid="export-thread">
                            <a
                                href={`/threads/${thread.id}/export.json`}
                                download={`thread-${thread.id}.json`}
                            >
                                <Download className="mr-1 h-3 w-3" aria-hidden="true" />
                                Export
                            </a>
                        </Button>
                        {/* M11 chunk 3: share-toggle popover. */}
                        <ShareMenu
                            threadId={thread.id}
                            shareToken={thread.share_token}
                            shareEnabledAt={thread.share_enabled_at}
                            origin={typeof window !== 'undefined' ? window.location.origin : ''}
                        />
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
    threadId,
    runs,
    events,
    usableModels,
}: {
    threadId: number;
    runs: RunRow[];
    events: RunEvent[];
    usableModels: UsableModel[];
}) {
    if (runs.length === 0) {
        return (
            <Card className="border-dashed bg-card/40 text-center" data-testid="empty-transcript">
                <CardContent className="flex flex-col items-center gap-3 py-10">
                    <ChevronUp className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                    <div className="space-y-1">
                        <p className="font-medium">No prompts yet</p>
                        <p className="text-sm text-muted-foreground">
                            Type your first one in the input above to start the thread.
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // M12 manual-testing UX revision: newest run at the top so the
    // user sees the most recent activity without scrolling. The
    // controller still returns runs in sequence_in_thread asc order
    // for the WebSocket subscription + active-run detection
    // (`findActiveRun` walks backwards already); we just reverse for
    // display.
    const displayRuns = [...runs].reverse();

    return (
        <section className="space-y-4" data-testid="transcript">
            {displayRuns.map((run) => {
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
                                <div className="flex items-center gap-2">
                                    {/* M9 chunk 1: replay link for terminal runs. */}
                                    {(run.status === 'complete' || run.status === 'error') && (
                                        <Link
                                            href={`/threads/${threadId}/runs/${run.id}/replay`}
                                            className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                            data-testid={`replay-link-${run.id}`}
                                            aria-label={`Replay run ${run.sequence_in_thread}`}
                                        >
                                            <Play className="h-3 w-3" aria-hidden="true" />
                                            Replay
                                        </Link>
                                    )}
                                    {/* M10 chunk 5: chooser dropdown
                                        (JSON / GIF / MP4) replaces the
                                        chunk-5 M9 JSON-only pill. Same
                                        terminal-only gating. */}
                                    {(run.status === 'complete' || run.status === 'error') && (
                                        <div data-testid={`download-link-${run.id}`}>
                                            <ExportDownloadMenu
                                                runId={run.id}
                                                jsonHref={`/runs/${run.id}/export.json`}
                                                size="pill"
                                            />
                                        </div>
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
                        className="ml-0.5 inline-block motion-safe:animate-pulse text-foreground/70"
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
                    {form.errors.model_id && (
                        <p className="text-xs text-destructive">{form.errors.model_id}</p>
                    )}
                    {/* M12 manual-testing: surface parameter validation
                        errors (parameters.seed, parameters.max_tokens, etc.)
                        instead of silently dropping them. Inertia gives us
                        dot-notation keys; filter the errors map by prefix. */}
                    {Object.entries(form.errors)
                        .filter(([key]) => key.startsWith('parameters.'))
                        .map(([key, message]) => (
                            <p
                                key={key}
                                className="text-xs text-destructive"
                                data-testid={`error-${key}`}
                            >
                                {key.replace('parameters.', '')}: {message}
                            </p>
                        ))}

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

/*
 * M13 chunk 1: LiveStreamPane removed. The M8-era debug-tab raw
 * event JSON view is no longer mounted; the new CinematicViz
 * mount owns the viz region. Chunk 13 will reintroduce a 2D /
 * debug-text fallback path inside CinematicViz for the
 * WebGL-2-unsupported case if needed.
 */
