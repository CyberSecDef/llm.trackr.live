import { Head } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

export default function Settings() {
    return (
        <>
            <Head title="Settings" />
            <AppLayout>
                <div className="p-8 max-w-2xl">
                    <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                    <p className="mt-3 text-sm text-slate-400">Profile and privacy preferences.</p>

                    <p className="mt-8 text-sm text-slate-500">
                        The <span className="font-mono">store_prompts</span> privacy toggle and
                        other controls land in M2 chunk 4.
                    </p>
                </div>
            </AppLayout>
        </>
    );
}
