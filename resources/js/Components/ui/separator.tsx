import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Separator primitive (M7 chunk 1).
 *
 * Plain visual divider — shadcn's official version wraps
 * @radix-ui/react-separator for ARIA semantics; we'll add that
 * dependency only if/when an a11y audit asks for it. Until then a
 * div with role="separator" is enough.
 */

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
    orientation?: 'horizontal' | 'vertical';
    decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
    ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
        <div
            ref={ref}
            role={decorative ? 'none' : 'separator'}
            aria-orientation={decorative ? undefined : orientation}
            className={cn(
                'shrink-0 bg-border',
                orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
                className,
            )}
            {...props}
        />
    ),
);
Separator.displayName = 'Separator';

export { Separator };
