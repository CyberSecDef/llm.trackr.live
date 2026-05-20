import { Head, Link } from '@inertiajs/react';

interface WelcomeProps {
    laravelVersion: string;
    phpVersion: string;
}

export default function Welcome({ laravelVersion, phpVersion }: WelcomeProps) {
    return (
        <>
            <Head title="Welcome" />
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
                <div className="max-w-2xl text-center space-y-6">
                    <h1 className="text-4xl font-bold tracking-tight">LLM-Viz</h1>
                    <p className="text-slate-400">
                        Interactive, real-time visualization of LLM inference internals.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Link
                            href={route('login')}
                            className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            Sign in →
                        </Link>
                        <Link
                            href="/about"
                            className="text-sm text-slate-400 underline hover:text-slate-200"
                            data-testid="welcome-about-link"
                        >
                            What is this?
                        </Link>
                    </div>

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
