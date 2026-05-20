import { Toaster as SonnerToaster, toast } from 'sonner';

/*
 * Toaster (M12 chunk 6) — shadcn-style wrapper around the `sonner`
 * toast library.
 *
 * Mounted once at the top of AppLayout so any descendant component
 * (or any non-component code via the exported `toast()` helper)
 * can fire success / error / info notifications without a portal
 * round-trip.
 *
 * Theme: matches our existing dark slate background. Position:
 * top-right so toasts don't collide with the page's bottom prompt
 * footer on Threads/Show.
 *
 * Accessibility: sonner sets role="status" + aria-live="polite" on
 * the container by default, so screen-reader users hear each toast
 * once without interruption.
 */

export function Toaster() {
    return (
        <SonnerToaster
            position="top-right"
            richColors
            closeButton
            theme="dark"
            toastOptions={{
                classNames: {
                    toast: 'bg-card border border-border text-foreground',
                    description: 'text-muted-foreground',
                },
            }}
        />
    );
}

export { toast };
