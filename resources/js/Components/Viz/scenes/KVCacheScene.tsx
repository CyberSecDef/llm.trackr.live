import { viridisAt } from '@/lib/vizColors';
import { type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 19 — KV cache (M13 chunk 9b).
 *
 * Per `phase1.md:1028` + `visualization.md:145-147`:
 *   "First time the loop kicks in, pause briefly and explain the
 *   cache visually. Show that the K and V matrices from all
 *   previous tokens appear in a dimmed/cached state — render them
 *   off to the side in a 'cache drawer' with a small lock/disk
 *   icon. For the new token, only its own row of K and V gets
 *   computed fresh and added to the drawer."
 *
 * Phases within t (2000ms):
 *   0.00 - 0.20 : drawer panel slides in from the right
 *   0.20 - 0.50 : K matrix fills row-by-row (cached tokens)
 *   0.50 - 0.75 : V matrix fills, mirroring K
 *   0.75 - 1.00 : "new row" highlight at the bottom of each;
 *                 caption explains the savings
 *
 * Output state: identity (camera/explanatory scene; no new
 * PipelineState fields).
 */

const SCENE_19_DURATION = 2000;
const CELL_SIZE = 6;
const ROWS_TO_RENDER = 8; // cap so the cache drawer stays compact

interface KVCacheSceneProps {
    t: number;
    state: PipelineState;
}

function KVCacheScene({ t, state }: KVCacheSceneProps) {
    const drawerOpen = Math.min(1, t / 0.2);
    const kFillProgress = Math.max(0, Math.min((t - 0.2) / 0.3, 1));
    const vFillProgress = Math.max(0, Math.min((t - 0.5) / 0.25, 1));
    const newRowPulse = Math.max(0, Math.min((t - 0.75) / 0.25, 1));

    // Approximate "rows" = generated-tokens so far (capped) + the new one
    // about to be added. For the chunk-9 viz we use the generatedTokens
    // length as the cached count.
    const cachedRows = Math.min(
        ROWS_TO_RENDER - 1,
        Math.max(1, state.generatedTokens?.length ?? 0),
    );

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-19-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-19-caption"
            >
                Scene 19 · KV cache
            </p>

            <div
                className="flex items-start gap-6"
                style={{
                    transform: `translateX(${(1 - drawerOpen) * 100}px)`,
                    opacity: drawerOpen,
                }}
                data-testid="scene-19-drawer"
            >
                {/* Left half: explanation */}
                <div className="flex max-w-xs flex-col items-start gap-2">
                    <div className="flex items-center gap-2">
                        <LockIcon />
                        <p className="text-[10px] font-mono font-medium uppercase tracking-wider text-cyan-300">
                            Cache drawer
                        </p>
                    </div>
                    <p className="text-[9px] text-muted-foreground/80">
                        K and V matrices from every prior token are cached. Only the current token
                        computes a fresh K + V row; the rest are looked up.
                    </p>
                    <p className="text-[9px] text-muted-foreground/60 italic">
                        Without this cache, every loop iteration would re-run attention over the
                        full sequence. With it, attention gains one new row per step.
                    </p>
                </div>

                {/* Right half: K + V matrices side-by-side */}
                <div className="flex gap-3" data-testid="scene-19-matrices">
                    <MatrixView
                        label="K"
                        fillProgress={kFillProgress}
                        cachedRows={cachedRows}
                        newRowPulse={newRowPulse}
                        testId="scene-19-k-matrix"
                        fillColor="#67e8f9"
                    />
                    <MatrixView
                        label="V"
                        fillProgress={vFillProgress}
                        cachedRows={cachedRows}
                        newRowPulse={newRowPulse}
                        testId="scene-19-v-matrix"
                        fillColor="#34d399"
                    />
                </div>
            </div>
        </div>
    );
}

interface MatrixViewProps {
    label: string;
    fillProgress: number;
    cachedRows: number;
    newRowPulse: number;
    testId: string;
    fillColor: string;
}

function MatrixView({
    label,
    fillProgress,
    cachedRows,
    newRowPulse,
    testId,
    fillColor,
}: MatrixViewProps) {
    const cols = 16; // representative head_dim
    const rows = ROWS_TO_RENDER;
    const rowsFilled = Math.floor(fillProgress * cachedRows);
    const totalH = rows * CELL_SIZE + 12;
    const totalW = cols * CELL_SIZE;

    return (
        <div className="flex flex-col items-center gap-1">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <svg
                width={totalW}
                height={totalH}
                aria-label={`${label} cache matrix`}
                data-testid={testId}
            >
                {/* Cached rows */}
                {Array.from({ length: rows }, (_, r) => {
                    const isCached = r < cachedRows;
                    const isFilled = r < rowsFilled;
                    const isNewRow = r === cachedRows; // bottom-most "new" row
                    return (
                        <g key={r}>
                            {Array.from({ length: cols }, (_, c) => {
                                const idx = r * cols + c;
                                const v = ((idx * 9301 + 49297) % 233280) / 233280;
                                let fill = '#0f172a';
                                let opacity = 0.4;
                                if (isFilled && isCached) {
                                    fill = viridisAt(v);
                                    opacity = 0.55;
                                } else if (isNewRow && newRowPulse > 0) {
                                    fill = fillColor;
                                    opacity = 0.4 + newRowPulse * 0.5;
                                }
                                return (
                                    <rect
                                        key={c}
                                        x={c * CELL_SIZE}
                                        y={r * CELL_SIZE}
                                        width={CELL_SIZE - 0.5}
                                        height={CELL_SIZE - 0.5}
                                        fill={fill}
                                        opacity={opacity}
                                    />
                                );
                            })}
                        </g>
                    );
                })}
                {/* New-row indicator arrow */}
                {newRowPulse > 0 && (
                    <text
                        x={totalW + 2}
                        y={cachedRows * CELL_SIZE + CELL_SIZE - 1}
                        fontSize="7"
                        fill={fillColor}
                        opacity={newRowPulse}
                        data-testid={`${testId}-new-row-marker`}
                    >
                        ← new
                    </text>
                )}
            </svg>
        </div>
    );
}

function LockIcon() {
    return (
        <svg
            width={14}
            height={14}
            viewBox="0 0 14 14"
            fill="none"
            stroke="#67e8f9"
            strokeWidth={1.2}
            data-testid="scene-19-lock-icon"
        >
            <rect x={3} y={6} width={8} height={6} rx={1} />
            <path d="M 5 6 V 4 a 2 2 0 0 1 4 0 V 6" />
        </svg>
    );
}

export const SCENE_KV_CACHE: Scene<PipelineState, PipelineState> = {
    id: 'kv-cache',
    durationMs: SCENE_19_DURATION,
    render: (t, state) => <KVCacheScene t={t} state={state} />,
    transform: (state) => state,
};

export default KVCacheScene;
