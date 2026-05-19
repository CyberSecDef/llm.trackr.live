import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * Label primitive (M7 chunk 1).
 *
 * Plain HTML <label> wrapper — the official shadcn Label uses
 * @radix-ui/react-label for ergonomic association, but we don't need
 * that here yet. Pair with Input via `htmlFor` / `id`.
 */
const labelVariants = cva(
    'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
);

const Label = React.forwardRef<
    HTMLLabelElement,
    React.LabelHTMLAttributes<HTMLLabelElement> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- design-system primitive; association is the caller's responsibility (via htmlFor / id).
    <label ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = 'Label';

export { Label };
