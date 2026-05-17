import { Head } from '@inertiajs/react';

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
                    <p className="text-sm text-slate-500">
                        Pre-implementation scaffold. See{' '}
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
