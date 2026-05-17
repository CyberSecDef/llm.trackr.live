import { Head, Link, usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';

const PROVIDERS = [
    { id: 'google', label: 'Continue with Google' },
    { id: 'microsoft', label: 'Continue with Microsoft' },
    { id: 'facebook', label: 'Continue with Facebook' },
] as const;

export default function Login() {
    const { errors } = usePage<PageProps & { errors: { social?: string } }>().props;

    return (
        <>
            <Head title="Sign in" />
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
                <div className="w-full max-w-sm space-y-6">
                    <div className="text-center space-y-2">
                        <h1 className="text-2xl font-bold tracking-tight">LLM-Viz</h1>
                        <p className="text-sm text-slate-400">Sign in to continue</p>
                    </div>

                    {errors.social && (
                        <div
                            role="alert"
                            className="px-3 py-2 text-sm rounded border border-red-900/50 bg-red-950/40 text-red-200"
                        >
                            {errors.social}
                        </div>
                    )}

                    <div className="space-y-2">
                        {PROVIDERS.map((provider) => (
                            <a
                                key={provider.id}
                                href={route('auth.redirect', { provider: provider.id })}
                                className="block w-full px-4 py-3 text-center bg-slate-800 hover:bg-slate-700 rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {provider.label}
                            </a>
                        ))}
                    </div>

                    <p className="text-xs text-slate-500 text-center">
                        By signing in you accept the terms in the{' '}
                        <a
                            href="https://github.com/CyberSecDef/llm.trackr.live"
                            className="underline hover:text-slate-300"
                        >
                            project repository
                        </a>
                        .
                    </p>

                    <p className="text-center">
                        <Link
                            href={route('home')}
                            className="text-xs text-slate-500 hover:text-slate-300"
                        >
                            ← Back to home
                        </Link>
                    </p>
                </div>
            </div>
        </>
    );
}
