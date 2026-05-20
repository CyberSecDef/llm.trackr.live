import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
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

// Same lazy imports as Pages/Runs/Replay.tsx + Pages/Threads/Show.tsx
// so the Three.js bundle is shared across all viz mount points.
const VizPane = lazy(() => import('@/Components/Viz/VizPane'));
const EmbeddingScene = lazy(() => import('@/Components/Viz/EmbeddingScene'));

/*
 * /share/{token}/runs/{run}/replay (M11 chunk 2) — public,
 * read-only replay.
 *
 * Structurally mirrors `Pages/Runs/Replay.tsx` (M9 chunk 1) but:
 *   - No `Back to thread` route into the authenticated thread page.
 *     Instead a "Back to shared thread" link to /share/{token}.
 *   - No download menu (M10 chunk 5b export endpoints are
 *     owner-only).
 *   - SharedLayout chrome instead of AppLayout.
 *
 * The viz stack (PlaybackControls + Viz / Embeddings / Debug) is
 * the same M8 component set; the read-only path just doesn't have
 * any owner-only features attached to it.
 */

interface SharedReplayProps {
    token: string;
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
        display_name: string;
        vendor: string;
        architecture_type: string | null;
        context_length: number | null;
        pricing_input_per_million: number | null;
        pricing_output_per_million: number | null;
        moe_experts: number | null;
        moe_active_experts: number | null;
    } | null;
    prompts_redacted: boolean;
}

export default function SharedReplay({
    token,
    thread,
    run,
    events,
    model,
    prompts_redacted,
}: SharedReplayProps) {
    const playback = useEventPlayback(events, {
        mode: 'replay',
        initialPlaying: false,
        initialCursor: 0,
        initialSpeed: 1,
    });

    return (
        <>
            <Head title={`Replay · Run #${run.sequence_in_thread}`} />
            <SharedLayout>
                <div className="p-6 md:p-8 max-w-7xl">
                    <ReplayHeader token={token} thread={thread} run={run} model={model} />
                    <div className="mt-4 grid gap-6 lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-4 min-w-0">
                            <ReplayBody
                                run={run}
                                events={playback.visibleEvents}
                                model={model}
                                promptsRedacted={prompts_redacted}
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
                            <ReplayRightPane
                                events={playback.visibleEvents}
                                totalLayers={run.total_layers}
                                architectureType={run.architecture_type}
                            />
                        </aside>
                    </div>
                </div>
            </SharedLayout>
        </>
    );
}

function ReplayHeader({
    token,
    thread,
    run,
    model,
}: {
    token: string;
    thread: SharedReplayProps['thread'];
    run: SharedReplayProps['run'];
    model: SharedReplayProps['model'];
}) {
    return (
        <header className="space-y-3" data-testid="shared-replay-header">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href={`/share/${token}`}>
                    <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                    Back to shared thread
                </Link>
            </Button>
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
                        data-testid="shared-replay-error-badge"
                    >
                        errored
                    </span>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                Anonymous view · {thread.title || 'Untitled thread'}
            </p>
        </header>
    );
}

function ReplayBody({
    run,
    events,
    model,
}: {
    run: SharedReplayProps['run'];
    events: RunEvent[];
    model: SharedReplayProps['model'];
    // promptsRedacted available on parent's prop; not needed inside
    // the body since the prompt field is already the redacted
    // string (controller does the substitution).
    promptsRedacted?: boolean;
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
        <Card data-testid={`shared-replay-run-${run.id}`}>
            <CardContent className="space-y-3 p-4">
                {run.prompt !== null && (
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            You
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{run.prompt}</p>
                    </div>
                )}

                <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Assistant
                    </p>
                    <p className="whitespace-pre-wrap text-sm" data-testid="shared-replay-text">
                        {metrics.liveText}
                        {metrics.outputTokens < (run.output_tokens ?? Infinity) && (
                            <span
                                className="ml-0.5 inline-block animate-pulse text-foreground/70"
                                aria-hidden="true"
                                data-testid="shared-replay-cursor"
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

                <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
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
                        <div className="space-y-0.5">
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
                                />
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

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
            <div className="flex rounded-md border border-border" role="tablist">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'viz'}
                    onClick={() => setMode('viz')}
                    disabled={reducedMotion}
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
                        <Card>
                            <CardContent className="p-6 text-center text-xs text-muted-foreground">
                                Loading…
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
                        <Card>
                            <CardContent className="p-6 text-center text-xs text-muted-foreground">
                                Loading…
                            </CardContent>
                        </Card>
                    }
                >
                    <EmbeddingScene events={events} status="streaming" />
                </Suspense>
            )}
            {mode === 'debug' && (
                <Card>
                    <CardContent className="space-y-2 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Replay event stream
                        </p>
                        <pre
                            className="max-h-[50vh] overflow-auto rounded bg-muted/40 p-2 text-[11px] font-mono leading-relaxed text-foreground/90"
                            data-testid="shared-replay-events"
                        >
                            {events.length === 0
                                ? '// click play to begin replay'
                                : events
                                      .map((e) =>
                                          JSON.stringify({ event: e.event, ...e.payload }, null, 2),
                                      )
                                      .join('\n\n')}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function SharedLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border bg-card/40 px-6 py-3">
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
                    href="/about"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    data-testid="shared-about-link"
                >
                    What is this?
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
                <span className="mx-2 text-muted-foreground/40">·</span>
                <a
                    href="https://github.com/CyberSecDef/llm.trackr.live"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    data-testid="shared-source-link"
                >
                    Source
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
            </footer>
        </div>
    );
}
