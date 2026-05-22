import { useMemo } from 'react';
import { blurAmount, cameraScale, counterValue, packetFloor, towerPhase } from '@/lib/towerCamera';
import { viridisAt } from '@/lib/vizColors';
import { type PipelineState, type Scene } from '@/Components/Viz/Scene';

/*
 * Scene 12 — Layer-stack tower (M13 chunk 7).
 *
 * The big camera move. Per `phase1.md:1024` + `visualization.md:98-106`:
 * camera pulls back to reveal scenes 5–11 were one floor of an
 * N-floor tower; a glowing packet ascends the tower with a layer
 * counter ticking, then re-zooms on the final layer.
 *
 * Five phases (managed by `lib/towerCamera`):
 *
 *   reveal  (1s):  camera zooms out, single floor → full tower.
 *   follow  (1s):  packet ascends floor 1 → floor 2, calm pace.
 *   blur    (3s):  packet accelerates through floors 2 → N-2,
 *                  counter ticks rapidly, packet renders as a
 *                  motion-blurred vertical streak.
 *   slow    (3s):  packet decelerates onto floors N-1 and N.
 *   rezoom  (2s):  camera zooms back in on floor N, final-layer
 *                  detail panel fades in below.
 *
 * Total: 10s. Pure-function camera math lives in `lib/towerCamera.ts`
 * so this component stays focused on SVG rendering + React glue.
 *
 * Tower render: SVG with N stacked floor rectangles. Camera scale
 * applied via a parent CSS transform so the whole assembly zooms
 * as one. Packet is a horizontal row of dots (one per token) that
 * translates up the tower; during the blur phase it elongates
 * vertically and adds transparent streak copies.
 */

const DEFAULT_TOTAL_LAYERS = 32;
const TOWER_WIDTH = 80;
const FLOOR_HEIGHT = 10;
const TOWER_PADDING = 20;
const PACKET_DOT_RADIUS = 2.5;

interface LayerStackSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    finalOutput: readonly (readonly number[])[];
    totalLayers: number;
}

function LayerStackScene({ t, tokens, finalOutput, totalLayers }: LayerStackSceneProps) {
    const tokenList = tokens ?? [];
    const N = totalLayers;

    const packet = packetFloor(t, N);
    const scale = cameraScale(t);
    const layer = counterValue(t, N);
    const blur = blurAmount(t);
    const phase = towerPhase(t);

    const counterLabel = `${String(layer).padStart(2, '0')} / ${String(N).padStart(2, '0')}`;
    const progressPct = Math.max(0, Math.min(1, (packet - 1) / Math.max(1, N - 1)));

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3"
            data-testid="scene-12-root"
        >
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-12-caption"
            >
                Scene 12 · Layer-stack tower
            </p>

            <div className="flex w-full items-center justify-center gap-6">
                {/* Tower SVG with camera scale applied */}
                <div
                    className="origin-center"
                    style={{
                        transform: `scale(${scale})`,
                        transition: 'transform 0ms',
                    }}
                    data-testid="scene-12-camera"
                >
                    <TowerSVG
                        totalLayers={N}
                        packet={packet}
                        blur={blur}
                        tokenCount={tokenList.length}
                    />
                </div>

                {/* Layer counter + progress bar */}
                <div
                    className="flex flex-col items-start gap-1 font-mono"
                    data-testid="scene-12-counter"
                >
                    <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                        Layer
                    </p>
                    <p
                        className="text-2xl font-semibold tabular-nums text-foreground"
                        data-testid="scene-12-counter-value"
                    >
                        {counterLabel}
                    </p>
                    <div
                        className="h-1.5 w-32 overflow-hidden rounded-full bg-card/40"
                        role="progressbar"
                        aria-label="Layer progress"
                        aria-valuenow={layer}
                        aria-valuemin={1}
                        aria-valuemax={N}
                    >
                        <div
                            className="h-full bg-cyan-400 transition-none"
                            style={{ width: `${progressPct * 100}%` }}
                            data-testid="scene-12-progress-bar"
                        />
                    </div>
                    <p className="mt-1 text-[8px] uppercase tracking-wider text-muted-foreground/60">
                        Phase: {phase}
                    </p>
                </div>
            </div>

            {phase === 'rezoom' && (
                <FinalLayerDetail
                    opacity={Math.min(1, (t - 0.8) / 0.1)}
                    tokenStrings={tokenList.map((tok) => tok.string)}
                    output={finalOutput}
                />
            )}
        </div>
    );
}

interface TowerSVGProps {
    totalLayers: number;
    packet: number;
    blur: number;
    tokenCount: number;
}

function TowerSVG({ totalLayers, packet, blur, tokenCount }: TowerSVGProps) {
    const towerHeight = totalLayers * FLOOR_HEIGHT + TOWER_PADDING * 2;
    // Floor 1 sits at the bottom; floor N at the top. Packet Y in
    // SVG coordinates = (totalLayers - packet) * floorHeight + padding.
    const packetY = (totalLayers - packet) * FLOOR_HEIGHT + TOWER_PADDING + FLOOR_HEIGHT / 2;

    // Pre-build the floor rectangles (memoize across renders that don't change N).
    const floors = useMemo(() => {
        const arr: number[] = [];
        for (let i = 0; i < totalLayers; i++) arr.push(i);
        return arr;
    }, [totalLayers]);

    // Packet dots: one per token, arranged horizontally inside the tower.
    const dotCount = Math.max(1, Math.min(tokenCount, 6));
    const dotSpacing = (TOWER_WIDTH - 10) / (dotCount + 1);

    return (
        <svg
            width={TOWER_WIDTH + TOWER_PADDING * 2}
            height={towerHeight}
            role="img"
            aria-label={`Tower of ${totalLayers} transformer layers; current packet on floor ${Math.round(packet)}`}
            data-testid="scene-12-tower"
        >
            {/* Tower outline */}
            <rect
                x={TOWER_PADDING}
                y={TOWER_PADDING}
                width={TOWER_WIDTH}
                height={totalLayers * FLOOR_HEIGHT}
                fill="#0f172a"
                stroke="#334155"
                strokeWidth={1}
            />

            {/* Floor dividers (every floor, dimmer for ones not active) */}
            {floors.map((i) => {
                const floorNumber = totalLayers - i;
                const isActive = Math.abs(floorNumber - packet) < 1;
                return (
                    <line
                        key={i}
                        x1={TOWER_PADDING}
                        y1={TOWER_PADDING + i * FLOOR_HEIGHT}
                        x2={TOWER_PADDING + TOWER_WIDTH}
                        y2={TOWER_PADDING + i * FLOOR_HEIGHT}
                        stroke={isActive ? '#67e8f9' : '#1e293b'}
                        strokeWidth={isActive ? 0.6 : 0.3}
                        opacity={isActive ? 0.9 : 0.5}
                        data-testid={`scene-12-floor-${floorNumber}`}
                    />
                );
            })}

            {/* Motion-blur streak (only during blur phase) */}
            {blur > 0 && (
                <rect
                    x={TOWER_PADDING + 4}
                    y={packetY - 30 * blur}
                    width={TOWER_WIDTH - 8}
                    height={60 * blur}
                    fill="#10b981"
                    opacity={0.2 * blur}
                    data-testid="scene-12-blur-streak"
                />
            )}

            {/* Packet (row of dots, glow halo) */}
            <g data-testid="scene-12-packet">
                {/* Glow halo */}
                <ellipse
                    cx={TOWER_PADDING + TOWER_WIDTH / 2}
                    cy={packetY}
                    rx={TOWER_WIDTH / 2 - 2}
                    ry={5}
                    fill="#10b981"
                    opacity={0.25 + blur * 0.5}
                />
                {/* Per-token dots */}
                {Array.from({ length: dotCount }, (_, i) => (
                    <circle
                        key={i}
                        cx={TOWER_PADDING + 5 + (i + 1) * dotSpacing}
                        cy={packetY}
                        r={PACKET_DOT_RADIUS}
                        fill={viridisAt(0.7)}
                        stroke="#34d399"
                        strokeWidth={0.5}
                    />
                ))}
            </g>
        </svg>
    );
}

interface FinalLayerDetailProps {
    opacity: number;
    tokenStrings: string[];
    output: readonly (readonly number[])[];
}

function FinalLayerDetail({ opacity, tokenStrings, output }: FinalLayerDetailProps) {
    return (
        <div
            className="mt-2 flex flex-col items-center gap-1 rounded-md border border-cyan-500/30 bg-card/40 p-2"
            style={{ opacity }}
            data-testid="scene-12-final-detail"
        >
            <p className="text-[9px] font-medium uppercase tracking-wider text-cyan-300">
                Final layer · attention + FFN
            </p>
            <div className="flex flex-col gap-0.5 font-mono">
                {output.slice(0, 4).map((row, i) => (
                    <FinalLayerStrip
                        key={i}
                        index={i}
                        values={row}
                        tokenString={tokenStrings[i] ?? ''}
                    />
                ))}
            </div>
            <p className="max-w-md text-center text-[8px] italic text-muted-foreground/70">
                After traversing the full tower, the final layer&apos;s output is the last hidden
                state — the input to the LM head in Scene 14.
            </p>
        </div>
    );
}

interface FinalLayerStripProps {
    index: number;
    values: readonly number[];
    tokenString: string;
}

function FinalLayerStrip({ index, values, tokenString }: FinalLayerStripProps) {
    const visible = values.slice(0, 64);
    const max = Math.max(1e-6, ...visible.map((v) => Math.abs(v)));
    const cellWidth = 200 / Math.max(1, visible.length);
    return (
        <div className="flex items-center gap-2" data-testid={`scene-12-final-row-${index}`}>
            <span className="w-4 text-center text-[8px] tabular-nums text-muted-foreground">
                {index}
            </span>
            <svg width={200} height={8} aria-hidden="true">
                {visible.map((v, k) => (
                    <rect
                        key={k}
                        x={k * cellWidth}
                        y={0}
                        width={cellWidth + 0.5}
                        height={8}
                        fill={viridisAt((v / max + 1) / 2)}
                    />
                ))}
            </svg>
            <span className="max-w-[60px] truncate text-[8px] text-muted-foreground/70">
                {tokenString === ' ' ? '·' : tokenString}
            </span>
        </div>
    );
}

/** Helper used by both render() and transform() to source the
 *  output that traversed the layer stack. */
function sourceFinalOutput(state: PipelineState): readonly (readonly number[])[] {
    return (
        state.residualOutput2 ??
        state.ffnOutput ??
        state.residualOutput ??
        state.attentionOutput ??
        state.layerNormed ??
        state.positionEncoded ??
        state.embeddings ??
        []
    );
}

export const SCENE_LAYER_STACK: Scene<PipelineState, PipelineState> = {
    id: 'layer-stack',
    durationMs: 10000,
    render: (t, state) => {
        const totalLayers = state.totalLayers ?? DEFAULT_TOTAL_LAYERS;
        const finalOutput = sourceFinalOutput(state);
        return (
            <LayerStackScene
                t={t}
                tokens={state.tokens}
                finalOutput={finalOutput}
                totalLayers={totalLayers}
            />
        );
    },
    transform: (state) => {
        // Scene 12 doesn't synthesize new vectors — it's a camera /
        // narrative scene. Its semantic output is "the layer stack
        // has been traversed", which downstream scenes interpret as
        // residualOutput2 representing the FINAL layer's output
        // (vs. the previous chunks' single-layer output). We don't
        // re-derive anything; the field is already populated by
        // Scene 11's transform. Returning identity keeps things
        // referentially stable.
        return state;
    },
};

export default LayerStackScene;
