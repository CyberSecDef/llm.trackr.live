import { Head, Link, usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';

interface WelcomeProps {
    laravelVersion: string;
    phpVersion: string;
}

export default function Welcome({ laravelVersion, phpVersion }: WelcomeProps) {
    const { auth } = usePage<PageProps>().props;

    return (
        <>
            <Head title="Welcome" />
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
                <div className="max-w-2xl text-center space-y-6">
                    <h1 className="text-4xl font-bold tracking-tight">LLM-Viz</h1>
                    <p className="text-slate-400">
                        Interactive, real-time visualization of LLM inference internals.
                    </p>

                    {auth.user ? (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-400">
                                Signed in as{' '}
                                <span className="text-slate-200">
                                    {auth.user.name ?? auth.user.email}
                                </span>
                            </p>
                            <Link
                                href={route('dashboard')}
                                className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm"
                            >
                                Go to dashboard →
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-400">Sign in to continue</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                <a
                                    href={route('auth.redirect', { provider: 'google' })}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm"
                                >
                                    Google
                                </a>
                                <a
                                    href={route('auth.redirect', { provider: 'microsoft' })}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm"
                                >
                                    Microsoft
                                </a>
                                <a
                                    href={route('auth.redirect', { provider: 'facebook' })}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm"
                                >
                                    Facebook
                                </a>
                            </div>
                        </div>
                    )}

                    <p className="text-sm text-slate-500">
                        See{' '}
                        <a
                            href="https://github.com/CyberSecDef/llm.trackr.live"
                            className="underline hover:text-slate-300"
                        >
                            the repository
                        </a>{' '}
                        for the spec and execution plan.
                    </p>
                    <div className="pt-6 text-xs text-slate-600 font-mono space-x-4">
                        <span>Laravel {laravelVersion}</span>
                        <span>·</span>
                        <span>PHP {phpVersion}</span>
                        <span>·</span>
                        <span>Inertia + React 19</span>
                    </div>
                </div>
            </div>
        </>
    );
}
