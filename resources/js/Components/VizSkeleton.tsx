import { Card, CardContent } from '@/Components/ui/card';
import { Skeleton } from '@/Components/ui/skeleton';

/*
 * VizSkeleton (M12 chunk 6) — Suspense fallback for the lazy-
 * loaded Three.js scenes (VizPane + EmbeddingScene).
 *
 * Reserves the same aspect-square footprint as the rendered canvas
 * so there's no layout shift when the real component finishes
 * mounting. `aria-label` carries the human-readable "what's
 * loading" string so screen-reader users hear "Loading
 * visualization" instead of just seeing a pulsing gray box.
 *
 * Uses the standard Skeleton primitive, which itself gates its
 * pulse animation via motion-safe: per the chunk-3 reduced-motion
 * audit.
 */

interface VizSkeletonProps {
    testId: string;
    label: string;
}

export default function VizSkeleton({ testId, label }: VizSkeletonProps) {
    return (
        <Card data-testid={testId}>
            <CardContent className="p-0">
                <div
                    className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-950"
                    role="status"
                    aria-label={label}
                >
                    <Skeleton
                        className="absolute inset-0 h-full w-full rounded-none bg-slate-900"
                        data-testid={`${testId}-skeleton`}
                    />
                    <span className="sr-only">{label}</span>
                </div>
                <div className="border-t border-border p-2 text-[10px] text-muted-foreground">
                    {label}…
                </div>
            </CardContent>
        </Card>
    );
}
