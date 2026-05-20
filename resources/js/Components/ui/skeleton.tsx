import { cn } from '@/lib/utils';

/*
 * Skeleton (M12 chunk 6) — placeholder block while content loads.
 *
 * Shadcn standard one-liner. Uses motion-safe:animate-pulse so it
 * stays still under prefers-reduced-motion (matching the chunk-3
 * decision to gate every animate-pulse via the motion-safe variant).
 *
 * Use case: Suspense fallbacks, fetch loading states, anywhere a
 * layout slot needs to reserve space without showing the real
 * content yet. Compose by setting width/height/border-radius via
 * className.
 */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('motion-safe:animate-pulse rounded-md bg-muted', className)}
            data-testid="skeleton"
            {...props}
        />
    );
}
