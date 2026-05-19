import { Head } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';
import { useRunStream } from '@/hooks/useRunStream';

/*
 * /runs/{id}/debug — internal debug view of a run's streaming events
 * (M6 chunks 4b + 5b). Top: static run metadata header + active
 * transport indicator. Below: chronological JSON event list, append-
 * only as either WebSocket or SSE delivers events.
 *
 * The real visualization page is M8 — this is the bare 'is the
 * pipeline alive?' view used to verify the streaming plumbing.
 *
 * `useRunStream` (chunk 4b + 5b) prefers WebSocket but falls back to
 * the SSE endpoint at `/runs/{id}/stream` if Echo is unavailable or
 * the WS connection enters `failed`/`unavailable`. When neither
 * transport is usable (no Echo, no EventSource), `transport` is
 * `'none'` and we render the offline notice.
 */

interface RunSummary {
    id: number;
    thread_id: number;
    model_id: number;
    sequence_in_thread: number;
    status: string;
    prompt: string | null;
    parameters: Record<string, unknown> | null;
    output_text: string | null;
    error_message: string | null;
    created_at: string | null;
}

interface DebugRunProps {
    run: RunSummary;
    channel: string;
}

const TRANSPORT_LABEL: Record<string, string> = {
    websocket: 'WebSocket',
    sse: 'SSE (fallback)',
    none: 'unavailable',
};

export default function DebugRun({ run, channel }: DebugRunProps) {
    const { events, status, transport, disabled } = useRunStream(run.id);

    return (
        <>
            <Head title={`Run #${run.id} — Debug`} />
            <AppLayout>
                <div className="p-8 max-w-5xl">
                    <h1 className="text-2xl font-bold tracking-tight">Run #{run.id} — Debug</h1>
                    <p className="mt-1 text-xs text-slate-500" data-testid="debug-channel">
                        Subscribed to <code>{channel}</code> · live status:{' '}
                        <strong>{status}</strong> · transport:{' '}
                        <strong data-testid="debug-transport">{TRANSPORT_LABEL[transport]}</strong>
                    </p>

                    <section
                        className="mt-6 grid gap-2 rounded-lg bg-slate-900 border border-slate-800 p-5 text-sm"
                        data-testid="run-metadata"
                    >
                        <Row label="Thread" value={run.thread_id} />
                        <Row label="Model" value={run.model_id} />
                        <Row label="Sequence" value={run.sequence_in_thread} />
                        <Row label="Persisted status" value={run.status} />
                        <Row label="Created" value={run.created_at ?? '—'} />
                        {run.error_message && <Row label="Error" value={run.error_message} />}
                    </section>

                    {disabled && (
                        <p
                            className="mt-6 text-sm text-amber-400"
                            data-testid="echo-disabled-notice"
                        >
                            No realtime transport is available — neither WebSocket nor SSE could be
                            established. The event list will stay empty until you reload from an
                            environment that supports at least one.
                        </p>
                    )}

                    <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">
                        Events ({events.length})
                    </h2>
                    <pre
                        className="mt-2 max-h-[60vh] overflow-auto rounded bg-slate-950 border border-slate-800 p-4 text-xs text-slate-300"
                        data-testid="event-stream"
                    >
                        {events.length === 0
                            ? '// waiting for events…'
                            : events
                                  .map((e) =>
                                      JSON.stringify({ event: e.event, ...e.payload }, null, 2),
                                  )
                                  .join('\n\n')}
                    </pre>
                </div>
            </AppLayout>
        </>
    );
}

function Row({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-200 font-mono">{String(value)}</span>
        </div>
    );
}
