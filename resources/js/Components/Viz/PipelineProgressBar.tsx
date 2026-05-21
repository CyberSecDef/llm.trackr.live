import { SCENE_IDS, SCENE_LABELS, type SceneId } from '@/Components/Viz/Scene';
import { cn } from '@/lib/utils';

/*
 * PipelineProgressBar (M13) — top, full-width persistent UI
 * section showing all 20 scenes as labeled segments. The current
 * scene is highlighted; clicking any segment fires onSelectScene
 * to jump to it (chunk 11 wires this to the SceneRunner.setScene
 * control).
 *
 * Chunk 1: full implementation since the control surface is
 * static (always 21 segments — Scene 0 through Scene 20) and the
 * label text is locked in `Scene.ts`. Chunks 3+ change which
 * segment is active as the runner advances.
 */

interface PipelineProgressBarProps {
    currentSceneId: SceneId;
    onSelectScene?: (sceneId: SceneId) => void;
}

export default function PipelineProgressBar({
    currentSceneId,
    onSelectScene,
}: PipelineProgressBarProps) {
    return (
        <nav
            className="flex w-full items-center gap-px overflow-x-auto rounded-md border border-border bg-card/40 p-1"
            aria-label="Pipeline progress"
            data-testid="viz-pipeline-progress"
        >
            {SCENE_IDS.map((id, i) => {
                const active = id === currentSceneId;
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onSelectScene?.(id)}
                        disabled={!onSelectScene}
                        aria-current={active ? 'step' : undefined}
                        aria-label={`Scene ${i}: ${SCENE_LABELS[id]}`}
                        title={`${i}. ${SCENE_LABELS[id]}`}
                        data-testid={`viz-pipeline-segment-${id}`}
                        className={cn(
                            'flex-1 min-w-[36px] rounded px-1.5 py-1 text-[9px] uppercase tracking-wider transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            active
                                ? 'bg-primary text-primary-foreground font-semibold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                            !onSelectScene && 'cursor-default',
                        )}
                    >
                        {SCENE_LABELS[id]}
                    </button>
                );
            })}
        </nav>
    );
}
