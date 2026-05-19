import { Head, Link, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import type { PageProps } from '@/types';
import { Button } from '@/Components/ui/button';

/*
 * Shared shell for the 4 error pages (M7 chunk 2). Not wrapped in
 * AppLayout — unauthenticated users hit these too (e.g. 404 on a
 * direct URL), so we keep the sidebar/topbar out.
 *
 * The "go home" CTA points to /dashboard when authed, /login when
 * not — usePage gives us the shared `auth.user` prop either way.
 */

interface ErrorShellProps {
    status: number;
    headline: string;
    message: ReactNode;
}

export default function ErrorShell({ status, headline, message }: ErrorShellProps) {
    const { auth } = usePage<PageProps>().props;
    const goHomeHref = auth.user ? '/dashboard' : '/login';
    const goHomeLabel = auth.user ? 'Back to dashboard' : 'Sign in';

    return (
        <>
            <Head title={`${status} — ${headline}`} />
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
                <div className="max-w-md text-center space-y-6">
                    <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                        Error {status}
                    </p>
                    <h1 className="text-4xl font-bold tracking-tight">{headline}</h1>
                    <div className="text-sm text-muted-foreground">{message}</div>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                        <Button asChild>
                            <Link href={goHomeHref}>{goHomeLabel}</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <a href="https://github.com/CyberSecDef/llm.trackr.live">Source</a>
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
