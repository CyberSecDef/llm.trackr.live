import { useEffect } from 'react';
import { viridisAt, normalize } from '@/lib/vizColors';
import { useVectorInspection } from '@/Components/Viz/VectorInspectionContext';

/*
 * NumericalValuesPanel (M13 chunk 11b) — right-overlay panel that
 * appears when a `<VectorStrip>` is clicked. Shows the first N cells
 * with their indices + raw values + viridis swatches, plus summary
 * statistics (mean / std / min / max).
 *
 * Docks over the right ~40% of the canvas with a semi-transparent
 * backdrop. Click the backdrop or × button to dismiss. Pressing
 * Escape also dismisses (a11y).
 *
 * Per `phase1.md:1036`: "The expanded panel docks to the side,
 * doesn't block the canvas."
 *
 * Mount alongside the scene canvas inside a
 * <VectorInspectionProvider>; the panel reads its open/close state
 * from the same context.
 */

const CELL_RENDER_CAP = 64;

export default function NumericalValuesPanel() {
    const inspection = useVectorInspection();

    // Close on Escape (a11y). useEffect attaches only while the panel
    // is mounted with an active selection so other keyboard handlers
    // aren't impaired.
    useEffect(() => {
        if (!inspection?.active) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') inspection.close();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [inspection]);

    if (!inspection?.active) return null;

    const { values, label } = inspection.active;
    const cells = values.slice(0, CELL_RENDER_CAP);
    const stats = computeStats(values);

    return (
        <div
            className="absolute inset-0 z-20 flex items-stretch justify-end"
            data-testid="viz-inspection-overlay"
        >
            {/* Backdrop (left ~60% of canvas) — click to dismiss */}
            <div
                className="flex-1 bg-slate-950/40 backdrop-blur-[1px]"
                onClick={inspection.close}
                role="presentation"
                data-testid="viz-inspection-backdrop"
            />

            {/* Panel (right ~40% of canvas) */}
            <aside
                className="flex w-[40%] max-w-md flex-col gap-2 overflow-y-auto rounded-l-md border border-border bg-slate-950/95 p-3 text-[10px] shadow-2xl"
                role="dialog"
                aria-label="Vector inspection panel"
                data-testid="viz-inspection-panel"
            >
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
                            Inspecting
                        </p>
                        <p
                            className="font-mono text-[11px] font-medium text-foreground"
                            data-testid="viz-inspection-label"
                        >
                            {label ?? 'Unnamed vector'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={inspection.close}
                        className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label="Close inspection panel"
                        data-testid="viz-inspection-close"
                    >
                        ×
                    </button>
                </div>

                <Stats stats={stats} totalLength={values.length} />

                <p
                    className="text-[9px] uppercase tracking-wider text-muted-foreground/70"
                    data-testid="viz-inspection-cells-header"
                >
                    First {cells.length} cells
                    {values.length > cells.length && ` (of ${values.length})`}
                </p>

                <CellTable cells={cells} />
            </aside>
        </div>
    );
}

interface VectorStats {
    mean: number;
    std: number;
    min: number;
    max: number;
}

function computeStats(values: readonly number[]): VectorStats {
    if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const mean = sum / values.length;
    let variance = 0;
    for (const v of values) variance += (v - mean) * (v - mean);
    variance /= values.length;
    return {
        mean,
        std: Math.sqrt(variance),
        min,
        max,
    };
}

function Stats({ stats, totalLength }: { stats: VectorStats; totalLength: number }) {
    return (
        <div
            className="grid grid-cols-4 gap-1 rounded border border-border bg-card/40 p-2 font-mono"
            data-testid="viz-inspection-stats"
        >
            <Stat label="dim" value={String(totalLength)} />
            <Stat label="mean" value={formatNumber(stats.mean)} />
            <Stat label="std" value={formatNumber(stats.std)} />
            <Stat label="range" value={`${formatNumber(stats.min)}…${formatNumber(stats.max)}`} />
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
                {label}
            </span>
            <span
                className="tabular-nums text-foreground"
                data-testid={`viz-inspection-stat-${label}`}
            >
                {value}
            </span>
        </div>
    );
}

function CellTable({ cells }: { cells: readonly number[] }) {
    const normed = normalize(cells);
    return (
        <ul
            className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono"
            data-testid="viz-inspection-cell-list"
        >
            {cells.map((v, i) => (
                <li
                    key={i}
                    className="flex items-center gap-1.5"
                    data-testid={`viz-inspection-cell-${i}`}
                >
                    <span
                        className="block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: viridisAt(normed[i]) }}
                        aria-hidden="true"
                    />
                    <span className="w-6 text-right tabular-nums text-muted-foreground/60">
                        {i}
                    </span>
                    <span className="tabular-nums text-foreground">{formatNumber(v)}</span>
                </li>
            ))}
        </ul>
    );
}

function formatNumber(n: number): string {
    if (!Number.isFinite(n)) return '∞';
    if (Math.abs(n) >= 100) return n.toFixed(1);
    if (Math.abs(n) >= 1) return n.toFixed(3);
    return n.toFixed(4);
}
