import { Head, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import UserAvatar from '@/Components/UserAvatar';
import type { PageProps, UserRole } from '@/types';

interface AdminUserRow {
    id: number;
    name: string | null;
    email: string;
    avatar_url: string | null;
    role: UserRole;
    max_runs_per_hour: number;
    created_at: string | null;
}

interface PaginatedUsers {
    data: AdminUserRow[];
    current_page: number;
    last_page: number;
    total: number;
    links: Array<{ url: string | null; label: string; active: boolean }>;
}

interface Props {
    users: PaginatedUsers;
}

function RateLimitForm({ user }: { user: AdminUserRow }) {
    const { flash } = usePage<PageProps & { flash?: { status?: string } }>().props;
    const { data, setData, patch, processing, errors } = useForm({
        max_runs_per_hour: user.max_runs_per_hour,
    });

    const justSaved = flash?.status === `rate-limit-updated:${user.id}`;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        patch(route('admin.users.update', { user: user.id }), {
            preserveScroll: true,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
                type="number"
                min={0}
                max={10000}
                step={1}
                value={data.max_runs_per_hour}
                onChange={(e) => setData('max_runs_per_hour', Number(e.target.value))}
                aria-label={`Max runs per hour for ${user.email}`}
                className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm"
            />
            <button
                type="submit"
                disabled={processing}
                className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded"
            >
                {processing ? '…' : 'Save'}
            </button>
            {justSaved && <span className="text-xs text-emerald-400">✓</span>}
            {errors.max_runs_per_hour && (
                <span role="alert" className="text-xs text-red-400">
                    {errors.max_runs_per_hour}
                </span>
            )}
        </form>
    );
}

export default function AdminUsers({ users }: Props) {
    return (
        <>
            <Head title="Admin · Users" />
            <AppLayout>
                <div className="p-8 max-w-6xl">
                    <h1 className="text-2xl font-bold tracking-tight">Users</h1>
                    <p className="mt-3 text-sm text-slate-400">
                        {users.total} {users.total === 1 ? 'user' : 'users'} registered.
                    </p>

                    <div className="mt-6 overflow-x-auto bg-slate-900 border border-slate-800 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
                                <tr>
                                    <th className="px-4 py-3 font-medium">User</th>
                                    <th className="px-4 py-3 font-medium">Role</th>
                                    <th className="px-4 py-3 font-medium">Max runs/hour</th>
                                    <th className="px-4 py-3 font-medium">Joined</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {users.data.map((user) => (
                                    <tr key={user.id}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <UserAvatar user={user} size={28} />
                                                <div className="min-w-0">
                                                    <p className="truncate">{user.name ?? '—'}</p>
                                                    <p className="text-xs text-slate-500 truncate">
                                                        {user.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">{user.role}</td>
                                        <td className="px-4 py-3">
                                            <RateLimitForm user={user} />
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500">
                                            {user.created_at
                                                ? new Date(user.created_at).toLocaleDateString()
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {users.last_page > 1 && (
                        <nav
                            aria-label="Pagination"
                            className="mt-4 flex flex-wrap gap-1 justify-center"
                        >
                            {users.links.map((link, idx) => (
                                <a
                                    key={`${link.label}-${idx}`}
                                    href={link.url ?? '#'}
                                    aria-disabled={!link.url}
                                    aria-current={link.active ? 'page' : undefined}
                                    className={`px-3 py-1 text-xs rounded border ${
                                        link.active
                                            ? 'bg-slate-800 border-slate-700 text-slate-100'
                                            : link.url
                                              ? 'border-slate-800 text-slate-400 hover:text-slate-200'
                                              : 'border-slate-900 text-slate-700 cursor-not-allowed'
                                    }`}
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                            ))}
                        </nav>
                    )}
                </div>
            </AppLayout>
        </>
    );
}
