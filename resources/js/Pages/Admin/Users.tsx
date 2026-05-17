import { Head } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

export default function AdminUsers() {
    return (
        <>
            <Head title="Admin · Users" />
            <AppLayout>
                <div className="p-8 max-w-5xl">
                    <h1 className="text-2xl font-bold tracking-tight">Users</h1>
                    <p className="mt-3 text-sm text-slate-400">Admin user management.</p>
                    <p className="mt-8 text-sm text-slate-500">
                        Per-user rate limit editor and the user list table land in M2 chunk 4. This
                        page is gated by the <span className="font-mono">admin</span> middleware
                        (HTTP 403 for non-admins) but is otherwise a placeholder.
                    </p>
                </div>
            </AppLayout>
        </>
    );
}
