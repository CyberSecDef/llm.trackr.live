import { Head, Link, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import type { PageProps } from '@/types';
import { Button } from '@/Components/ui/button';

/*
 * Shared shell for the 5 error pages (M7 chunk 2 + M12 chunk 7
 * polish). Not wrapped in AppLayout — unauthenticated users hit
 * these too (e.g. 404 on a direct URL), so we keep the
 * sidebar/topbar out.
 *
 * CTAs (in order):
 *   1. Primary: "Back to dashboard" / "Sign in" depending on auth.
 *   2. Secondary: "Go back" — invokes history.back() so a user who
 *      hit the error from a deep link can return where they came
 *      from. Falls back to /dashboard via Link if history is empty.
 *   3. Source link — AGPL §13 compliance on every served page.
 *
 * Icons added in M12 chunk 7 for visual differentiation between
 * error types; defaults to null for backwards compatibility.
 */

interface ErrorShellProps {
    status: number;
    headline: string;
    message: ReactNode;
    /** Optional decorative icon shown above the status line. */
    icon?: ReactNode;
}

export default function ErrorShell({ status, headline, message, icon }: ErrorShellProps) {
    const { auth } = usePage<PageProps>().props;
    const goHomeHref = auth.user ? '/dashboard' : '/login';
    const goHomeLabel = auth.user ? 'Back to dashboard' : 'Sign in';

    const handleGoBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            window.history.back();
        } else {
            // Empty history (direct deep-link hit). Fall through to
            // the primary CTA's destination.
            window.location.assign(goHomeHref);
        }
    };

    return (
        <>
            <Head title={`${status} — ${headline}`} />
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
                <div className="max-w-md text-center space-y-6">
                    {icon && (
                        <div
                            className="flex justify-center text-muted-foreground"
                            data-testid="error-icon"
                            aria-hidden="true"
                        >
                            {icon}
                        </div>
                    )}
                    <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                        Error {status}
                    </p>
                    <h1 className="text-4xl font-bold tracking-tight">{headline}</h1>
                    <div className="text-sm text-muted-foreground">{message}</div>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                        <Button asChild>
                            <Link href={goHomeHref}>{goHomeLabel}</Link>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleGoBack}
                            data-testid="error-go-back"
                        >
                            Go back
                        </Button>
                        <Button asChild variant="ghost">
                            <a href="https://github.com/CyberSecDef/llm.trackr.live">Source</a>
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
