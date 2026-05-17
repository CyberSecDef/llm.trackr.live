import { Head } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Props {
    feature: string;
    milestone: string;
}

export default function ComingSoon({ feature, milestone }: Props) {
    return (
        <>
            <Head title={feature} />
            <AppLayout>
                <div className="p-8 max-w-3xl">
                    <h1 className="text-2xl font-bold tracking-tight">{feature}</h1>
                    <p className="mt-3 text-sm text-slate-400">
                        Coming online in <span className="font-mono">{milestone}</span>.
                    </p>
                    <p className="mt-6 text-sm text-slate-500">
                        This page is a navigational placeholder so the full Phase 1 information
                        architecture is visible from day one. Check the{' '}
                        <a
                            href="https://github.com/CyberSecDef/llm.trackr.live/blob/main/docs/phase1.md"
                            className="underline hover:text-slate-300"
                        >
                            phase 1 plan
                        </a>{' '}
                        for milestone details.
                    </p>
                </div>
            </AppLayout>
        </>
    );
}
