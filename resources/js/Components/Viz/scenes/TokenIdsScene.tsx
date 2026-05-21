import TokenPill from '@/Components/Viz/TokenPill';
import type { PipelineState, Scene } from '@/Components/Viz/Scene';

/*
 * Scene 4 — Token ID array (M13 chunk 3c).
 *
 * Per `docs/visualization.md`: "Just clean integers in a row. A
 * label appears: 'context length: N tokens.' This gives the viewer
 * a moment to register the compression that just happened."
 *
 * Implementation: pure presenter. By t=0 the prompt's tokens are
 * already in PipelineState (Scene 3's transform populated them).
 * Each token is rendered as a small TokenPill in `showId` mode so
 * the integer ID is the dominant visual; the string label is the
 * tiny line below.
 *
 * The "context length: N" label fades in across t=0..0.5 then
 * stays solid for the second half. Half-second of breathing room
 * before Scene 5's embedding-lookup zoom-out.
 *
 * Output state: identity (Scene 3's transform already populated
 * tokens + contextLength).
 */

interface TokenIdsSceneProps {
    t: number;
    tokens: PipelineState['tokens'];
    contextLength: number;
}

function TokenIdsScene({ t, tokens, contextLength }: TokenIdsSceneProps) {
    const labelOpacity = Math.min(t / 0.5, 1);

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden p-4">
            <p
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70"
                data-testid="scene-4-caption"
            >
                Scene 4 · Token ID array
            </p>

            <div
                className="flex flex-wrap items-center justify-center gap-1"
                data-testid="scene-4-row"
            >
                {tokens?.map((tok, i) => (
                    <TokenPill
                        key={i}
                        tokenId={tok.id}
                        label={tok.string === ' ' ? '·' : tok.string}
                        showId
                        size="sm"
                    />
                ))}
            </div>

            <p
                className="rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs font-medium text-foreground/90"
                style={{ opacity: labelOpacity }}
                data-testid="scene-4-context-length-label"
            >
                Context length: <span className="font-mono tabular-nums">{contextLength}</span>{' '}
                tokens
            </p>
        </div>
    );
}

export const SCENE_TOKEN_IDS: Scene<PipelineState, PipelineState> = {
    id: 'token-ids',
    durationMs: 800,
    render: (t, state) => (
        <TokenIdsScene
            t={t}
            tokens={state.tokens ?? []}
            contextLength={state.contextLength ?? state.tokens?.length ?? 0}
        />
    ),
    transform: (state) => state,
};

export default TokenIdsScene;
