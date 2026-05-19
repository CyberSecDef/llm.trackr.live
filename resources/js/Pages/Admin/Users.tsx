import { Head, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import UserAvatar from '@/Components/UserAvatar';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { cn } from '@/lib/utils';
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
        <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2"
            data-testid={`rate-limit-form-${user.id}`}
        >
            <Input
                type="number"
                min={0}
                max={10000}
                step={1}
                value={data.max_runs_per_hour}
                onChange={(e) => setData('max_runs_per_hour', Number(e.target.value))}
                aria-label={`Max runs per hour for ${user.email}`}
                className="h-8 w-20 text-xs"
                data-testid={`rate-limit-input-${user.id}`}
            />
            <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={processing}
                data-testid={`rate-limit-submit-${user.id}`}
            >
                {processing ? '…' : 'Save'}
            </Button>
            {justSaved && (
                <span
                    className="text-xs text-emerald-400"
                    data-testid={`rate-limit-saved-${user.id}`}
                >
                    ✓
                </span>
            )}
            {errors.max_runs_per_hour && (
                <span role="alert" className="text-xs text-destructive">
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
            <AppLayout title="Admin · Users">
                <div className="p-6 md:p-8 max-w-6xl space-y-6">
                    <header>
                        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {users.total} {users.total === 1 ? 'user' : 'users'} registered.
                        </p>
                    </header>

                    <Card>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-sm" data-testid="users-table">
                                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">User</th>
                                        <th className="px-4 py-3 font-medium">Role</th>
                                        <th className="px-4 py-3 font-medium">Max runs/hour</th>
                                        <th className="px-4 py-3 font-medium">Joined</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {users.data.map((user) => (
                                        <tr key={user.id} data-testid={`user-row-${user.id}`}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar user={user} size={28} />
                                                    <div className="min-w-0">
                                                        <p className="truncate">
                                                            {user.name ?? '—'}
                                                        </p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {user.role}
                                            </td>
                                            <td className="px-4 py-3">
                                                <RateLimitForm user={user} />
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {user.created_at
                                                    ? new Date(user.created_at).toLocaleDateString()
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    {users.last_page > 1 && (
                        <nav
                            aria-label="Pagination"
                            className="flex flex-wrap justify-center gap-1"
                            data-testid="pagination"
                        >
                            {users.links.map((link, idx) => (
                                <a
                                    key={`${link.label}-${idx}`}
                                    href={link.url ?? '#'}
                                    aria-disabled={!link.url}
                                    aria-current={link.active ? 'page' : undefined}
                                    className={cn(
                                        'rounded-md border px-3 py-1 text-xs transition-colors',
                                        link.active &&
                                            'border-border bg-accent text-accent-foreground',
                                        !link.active &&
                                            link.url &&
                                            'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50',
                                        !link.url &&
                                            'border-transparent text-muted-foreground/40 cursor-not-allowed',
                                    )}
                                    // Laravel paginator embeds &laquo;/&raquo; entities for next/prev.
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
