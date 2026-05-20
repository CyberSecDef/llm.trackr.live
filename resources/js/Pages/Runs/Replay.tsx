import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Radio } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import ExportDownloadMenu from '@/Components/ExportDownloadMenu';
import LogitsDistribution from '@/Components/LogitsDistribution';
import MoERouting from '@/Components/MoERouting';
import PlaybackControls from '@/Components/PlaybackControls';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { useEventPlayback, type PlaybackSpeed } from '@/hooks/useEventPlayback';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { computeStreamMetrics } from '@/lib/streamMetrics';
import { cn } from '@/lib/utils';
import type { RunEvent } from '@/types/runs';

// Same lazy imports the thread detail page uses so the Three.js
// bundle is shared between the live + replay paths.
const VizPane = lazy(() => import('@/Components/Viz/VizPane'));
const EmbeddingScene = lazy(() => import('@/Components/Viz/EmbeddingScene'));

/*
 * /threads/{thread}/runs/{run}/replay (M9 chunk 1).
 *
 * Standalone replay page: re-runs a saved Run's animation without
 * hitting the vendor again. The backend (ReplayController +
 * RunReplayEventSynthesizer) hands us the full RunEvent[] sequence
 * — identical to what the original live broadcast emitted — and
 * we feed it through the M8 stack via useEventPlayback in 'replay'
 * mode (1× = throttled, not LIVE head-sync).
 *
 * Per chunk-1 decision: starts paused at cursor=0 so the user
 * sees the empty starting state, then clicks Play.
 */

interface ReplayPageProps {
    thread: {
        id: number;
        title: string | null;
    };
    run: {
        id: number;
        sequence_in_thread: number;
        status: 'complete' | 'error';
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
    };
    events: RunEvent[];
    model: {
        id: number;
        vendor: string;
        name: string;
        display_name: string;
        architecture_type: string | null;
        context_length: number | null;
        pricing_input_per_million: number | null;
        pricing_output_per_million: number | null;
        moe_experts: number | null;
        moe_active_experts: number | null;
    } | null;
}

export default function Replay({ thread, run, events, model }: ReplayPageProps) {
    const playback = useEventPlayback(events, {
        mode: 'replay',
        initialPlaying: false,
        initialCursor: 0,
        initialSpeed: 1,
    });

    return (
        <>
            <Head title={`Replay · Run #${run.sequence_in_thread}`} />
            <AppLayout title="Replay">
                <div className="p-6 md:p-8 max-w-7xl">
                    <ReplayHeader thread={thread} run={run} model={model} />
                    <div className="mt-4 grid gap-6 lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-4 min-w-0">
                            <ReplayBody run={run} events={playback.visibleEvents} model={model} />
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
                            <ReplayRightPane
                                events={playback.visibleEvents}
                                totalLayers={run.total_layers}
                                architectureType={run.architecture_type}
                            />
                        </aside>
                    </div>
                </div>
            </AppLayout>
        </>
    );
}

function ReplayHeader({
    thread,
    run,
    model,
}: {
    thread: ReplayPageProps['thread'];
    run: ReplayPageProps['run'];
    model: ReplayPageProps['model'];
}) {
    return (
        <header className="space-y-3" data-testid="replay-header">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <Button asChild variant="ghost" size="sm" className="-ml-2">
                    <Link href={`/threads/${thread.id}`}>
                        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                        Back to thread
                    </Link>
                </Button>
                {/* M10 chunk 5: chooser dropdown (JSON / GIF / MP4)
                    replaces the M9 single-format download button. */}
                <div data-testid="replay-download">
                    <ExportDownloadMenu runId={run.id} jsonHref={`/runs/${run.id}/export.json`} />
                </div>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">
                    Replay · Run #{run.sequence_in_thread}
                </h1>
                {model && (
                    <span className="text-xs text-muted-foreground">
                        {model.display_name}{' '}
                        <span className="text-muted-foreground/70">({model.vendor})</span>
                    </span>
                )}
                {run.status === 'error' && (
                    <span
                        className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive-foreground"
                        data-testid="replay-error-badge"
                    >
                        errored
                    </span>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                Synthesized from the saved token log — no vendor call.
                {thread.title && (
                    <>
                        {' '}
                        Thread: <span className="text-foreground/80">{thread.title}</span>
                    </>
                )}
            </p>
        </header>
    );
}

/**
 * The replay equivalent of the thread page's `LiveRunBody`: the
 * prompt as static text, the assistant output re-streamed via
 * playback.visibleEvents (drives the cursor + metrics strip + logits
 * + MoE routing), and the error message if any.
 */
function ReplayBody({
    run,
    events,
    model,
}: {
    run: ReplayPageProps['run'];
    events: RunEvent[];
    model: ReplayPageProps['model'];
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

    const pctRaw =
        metrics.contextBudget !== null && metrics.contextBudget > 0
            ? (metrics.contextUsed / metrics.contextBudget) * 100
            : null;
    const pct = pctRaw !== null ? Math.min(100, pctRaw) : null;

    return (
        <Card data-testid={`replay-run-${run.id}`}>
            <CardContent className="space-y-3 p-4">
                {run.prompt !== null && (
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            You
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{run.prompt}</p>
                    </div>
                )}

                <div className="space-y-1" data-testid="replay-assistant-block">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Assistant
                    </p>
                    <p className="whitespace-pre-wrap text-sm" data-testid="replay-assistant-text">
                        {metrics.liveText}
                        {metrics.outputTokens < (run.output_tokens ?? Infinity) && (
                            <span
                                className="ml-0.5 inline-block animate-pulse text-foreground/70"
                                aria-hidden="true"
                                data-testid="replay-cursor"
                            >
                                ▍
                            </span>
                        )}
                    </p>
                </div>

                {run.status === 'error' && run.error_message && (
                    <p className="text-xs text-destructive">{run.error_message}</p>
                )}

                <LogitsDistribution events={events} />

                {model?.architecture_type === 'moe' && (
                    <MoERouting
                        events={events}
                        totalExperts={model.moe_experts ?? null}
                        activeExperts={model.moe_active_experts ?? null}
                    />
                )}

                <div className="space-y-1.5" data-testid="replay-metrics">
                    <p className="text-xs text-muted-foreground" data-testid="replay-numbers">
                        {metrics.outputTokens.toLocaleString()} out
                        {metrics.tps !== null ? ` · ${metrics.tps.toFixed(1)} t/s` : ' · — t/s'}
                        {metrics.costSoFar !== null ? ` · $${metrics.costSoFar.toFixed(4)}` : ''}
                        {run.duration_ms !== null && (
                            <span className="ml-2 text-muted-foreground/70">
                                (original: {run.duration_ms}ms total)
                            </span>
                        )}
                    </p>
                    {pct !== null && (
                        <div className="space-y-0.5" data-testid="replay-context-bar">
                            <p className="text-[10px] text-muted-foreground">
                                {metrics.contextUsed.toLocaleString()} /{' '}
                                {metrics.contextBudget?.toLocaleString()} ctx
                                <span className="ml-1 text-muted-foreground/70">
                                    ({pct.toFixed(0)}%)
                                </span>
                            </p>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn(
                                        'h-full transition-all',
                                        pct >= 100
                                            ? 'bg-destructive'
                                            : pct >= 80
                                              ? 'bg-amber-500'
                                              : 'bg-primary',
                                    )}
                                    style={{ width: `${Math.max(2, pct)}%` }}
                                    data-testid="replay-context-bar-fill"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Standalone Viz/Embeddings/Debug tab wrapper for the replay page.
 * Same layout + state machine as `Threads/Show.tsx`'s `RightPane`
 * (M8 chunk 7) but without the live-stream transport plumbing —
 * replay has no WebSocket. The Debug tab still shows the raw event
 * JSON, useful for inspecting which events fire when.
 */
function ReplayRightPane({
    events,
    totalLayers,
    architectureType,
}: {
    events: RunEvent[];
    totalLayers: number | null;
    architectureType: string | null;
}) {
    const reducedMotion = useReducedMotion();
    const [mode, setMode] = useState<'viz' | 'embeddings' | 'debug'>(
        reducedMotion ? 'debug' : 'viz',
    );

    useEffect(() => {
        if (reducedMotion && mode === 'viz') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMode('debug');
        }
    }, [reducedMotion, mode]);

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
                    className={cn(
                        'flex-1 rounded-l-md px-3 py-1.5 text-xs transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
                        status="streaming"
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
                    <EmbeddingScene events={events} status="streaming" />
                </Suspense>
            )}
            {mode === 'debug' && <ReplayDebugPane events={events} />}
        </div>
    );
}

function ReplayDebugPane({ events }: { events: RunEvent[] }) {
    return (
        <Card data-testid="replay-debug-pane">
            <CardContent className="space-y-2 p-4">
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Radio className="h-3 w-3" aria-hidden="true" />
                    Replay event stream
                </p>
                <pre
                    className="max-h-[50vh] overflow-auto rounded bg-muted/40 p-2 text-[11px] font-mono leading-relaxed text-foreground/90"
                    data-testid="replay-events"
                >
                    {events.length === 0
                        ? '// click play to begin replay'
                        : events
                              .map((e) => JSON.stringify({ event: e.event, ...e.payload }, null, 2))
                              .join('\n\n')}
                </pre>
            </CardContent>
        </Card>
    );
}
