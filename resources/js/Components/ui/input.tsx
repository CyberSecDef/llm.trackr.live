import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Input primitive (M7 chunk 1).
 *
 * forwardRef so react-hook-form (when we adopt it later) and direct
 * focus management work. No baked-in label — pair with the Label
 * primitive in callers.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    className,
                )}
                ref={ref}
                {...props}
            />
        );
    },
);
Input.displayName = 'Input';

export { Input };
