import { Head, usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';
import AppLayout from '@/Layouts/AppLayout';

export default function Dashboard() {
    const { auth } = usePage<PageProps>().props;

    return (
        <>
            <Head title="Dashboard" />
            <AppLayout>
                <div className="p-8 max-w-5xl">
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    <p className="mt-2 text-sm text-slate-400">
                        Welcome back{auth.user?.name ? `, ${auth.user.name}` : ''}.
                    </p>

                    <section className="mt-8 grid gap-4 md:grid-cols-3">
                        <div className="rounded-lg bg-slate-900 border border-slate-800 p-5">
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                                Total runs
                            </p>
                            <p className="mt-2 text-2xl font-semibold">0</p>
                        </div>
                        <div className="rounded-lg bg-slate-900 border border-slate-800 p-5">
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                                Tokens generated
                            </p>
                            <p className="mt-2 text-2xl font-semibold">0</p>
                        </div>
                        <div className="rounded-lg bg-slate-900 border border-slate-800 p-5">
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                                Estimated cost
                            </p>
                            <p className="mt-2 text-2xl font-semibold">$0.00</p>
                        </div>
                    </section>

                    <p className="mt-10 text-sm text-slate-500">
                        Stats wire up once threads and runs land in M5. For now this is a
                        layout-only placeholder so the sidebar shell is exercised.
                    </p>
                </div>
            </AppLayout>
        </>
    );
}
