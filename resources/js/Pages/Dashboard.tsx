import { Head, useForm } from '@inertiajs/react';
import { usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';

export default function Dashboard() {
    const { auth } = usePage<PageProps>().props;
    const { post, processing } = useForm({});

    const handleLogout = (e: React.FormEvent) => {
        e.preventDefault();
        post(route('logout'));
    };

    return (
        <>
            <Head title="Dashboard" />
            <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
                <div className="max-w-3xl mx-auto space-y-6">
                    <header className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold">Dashboard</h1>
                        <form onSubmit={handleLogout}>
                            <button
                                type="submit"
                                disabled={processing}
                                className="text-sm text-slate-400 hover:text-slate-200 underline"
                            >
                                Log out
                            </button>
                        </form>
                    </header>
                    <div className="bg-slate-900 rounded-lg p-6 space-y-2">
                        <p className="text-sm text-slate-400">Signed in as</p>
                        <p className="text-lg">{auth.user?.name ?? auth.user?.email}</p>
                        <p className="text-xs text-slate-500 font-mono">
                            role: {auth.user?.role} · id: {auth.user?.id}
                        </p>
                    </div>
                    <p className="text-sm text-slate-500">
                        This is a placeholder. Chunk 3 of M2 replaces it with the real sidebar
                        shell. The threads list comes online in M5.
                    </p>
                </div>
            </div>
        </>
    );
}
