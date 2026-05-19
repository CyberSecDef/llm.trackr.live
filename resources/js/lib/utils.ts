import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with conflict resolution (M7 chunk 1).
 *
 * Used pervasively by shadcn-style components to compose a base
 * variant class string with a caller-provided `className` override:
 *
 *   className={cn('inline-flex h-10 px-4', variant === 'lg' && 'h-12', className)}
 *
 * tailwind-merge handles the case where the override should win
 * over a base class for the same utility group (e.g. `px-2` in
 * className overrides the base `px-4`).
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
