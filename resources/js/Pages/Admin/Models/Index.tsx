import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { type FormEvent, useState } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/Components/ui/alert-dialog';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { cn } from '@/lib/utils';
import type { PageProps } from '@/types';

interface ModelRow {
    id: number;
    vendor: string;
    name: string;
    display_name: string | null;
    architecture_type: 'dense' | 'moe' | null;
    context_length: number | null;
    pricing_input_per_million: number | null;
    pricing_output_per_million: number | null;
    manual_override: boolean;
    metadata_estimated: boolean;
}

interface PaginatedModels {
    data: ModelRow[];
    current_page: number;
    last_page: number;
    total: number;
    links: Array<{ url: string | null; label: string; active: boolean }>;
}

interface Props {
    models: PaginatedModels;
    filters: {
        search: string;
        vendor: string;
        architecture: string;
    };
    vendors: string[];
}

function formatPrice(value: number | null): string {
    if (value === null) return '—';
    return `$${value.toFixed(2)}/M`;
}

function formatContext(value: number | null): string {
    if (value === null) return '—';
    if (value >= 1000) return `${Math.round(value / 1000)}K`;
    return String(value);
}

export default function AdminModelsIndex({ models, filters, vendors }: Props) {
    const { flash, errors } = usePage<
        PageProps & { flash?: { status?: string }; errors: { refresh?: string } }
    >().props;
    const { data, setData, get, processing } = useForm({
        search: filters.search,
        vendor: filters.vendor,
        architecture: filters.architecture,
    });

    const [confirmRefresh, setConfirmRefresh] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<ModelRow | null>(null);

    const handleFilter = (e: FormEvent) => {
        e.preventDefault();
        get(route('admin.models.index'), { preserveState: true, preserveScroll: true });
    };

    const doRefresh = () => {
        router.post(
            route('admin.models.refresh'),
            {},
            { onFinish: () => setConfirmRefresh(false) },
        );
    };

    const doDelete = () => {
        if (!pendingDelete) return;
        router.delete(route('admin.models.destroy', { model: pendingDelete.id }), {
            onFinish: () => setPendingDelete(null),
        });
    };

    return (
        <>
            <Head title="Admin · Models" />
            <AppLayout title="Admin · Models">
                <div className="p-6 md:p-8 max-w-7xl space-y-6">
                    <header className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Model Registry</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {models.total} {models.total === 1 ? 'model' : 'models'} registered.
                            </p>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setConfirmRefresh(true)}
                            data-testid="refresh-trigger"
                        >
                            Refresh from OpenRouter
                        </Button>
                    </header>

                    {flash?.status?.startsWith('refresh-complete') && (
                        <div
                            className="rounded-md border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200"
                            data-testid="refresh-complete"
                        >
                            {flash.status.replace('refresh-complete:', '')}
                        </div>
                    )}
                    {flash?.status?.startsWith('model-updated:') && (
                        <div className="rounded-md border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                            Model updated.
                        </div>
                    )}
                    {flash?.status?.startsWith('model-deleted:') && (
                        <div className="rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
                            Deleted {flash.status.replace('model-deleted:', '')}.
                        </div>
                    )}
                    {errors.refresh && (
                        <div
                            role="alert"
                            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
                        >
                            {errors.refresh}
                        </div>
                    )}

                    <Card>
                        <CardContent className="p-4">
                            <form
                                onSubmit={handleFilter}
                                className="flex flex-wrap items-end gap-3"
                                data-testid="filters-form"
                            >
                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="search"
                                        className="text-xs uppercase tracking-wide text-muted-foreground"
                                    >
                                        Search
                                    </Label>
                                    <Input
                                        id="search"
                                        type="search"
                                        value={data.search}
                                        onChange={(e) => setData('search', e.target.value)}
                                        placeholder="name or display name"
                                        className="h-9 w-64 text-sm"
                                        data-testid="search-input"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="vendor"
                                        className="text-xs uppercase tracking-wide text-muted-foreground"
                                    >
                                        Vendor
                                    </Label>
                                    <select
                                        id="vendor"
                                        value={data.vendor}
                                        onChange={(e) => setData('vendor', e.target.value)}
                                        data-testid="vendor-filter"
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                        <option value="">all</option>
                                        {vendors.map((v) => (
                                            <option key={v} value={v}>
                                                {v}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="architecture"
                                        className="text-xs uppercase tracking-wide text-muted-foreground"
                                    >
                                        Architecture
                                    </Label>
                                    <select
                                        id="architecture"
                                        value={data.architecture}
                                        onChange={(e) => setData('architecture', e.target.value)}
                                        data-testid="arch-filter"
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                        <option value="">all</option>
                                        <option value="dense">dense</option>
                                        <option value="moe">moe</option>
                                    </select>
                                </div>
                                <Button
                                    type="submit"
                                    variant="outline"
                                    size="sm"
                                    disabled={processing}
                                    data-testid="filter-submit"
                                >
                                    Filter
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-sm" data-testid="models-table">
                                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Vendor</th>
                                        <th className="px-4 py-3 font-medium">Name</th>
                                        <th className="px-4 py-3 font-medium">Architecture</th>
                                        <th className="px-4 py-3 font-medium">Context</th>
                                        <th className="px-4 py-3 font-medium">In</th>
                                        <th className="px-4 py-3 font-medium">Out</th>
                                        <th className="px-4 py-3 font-medium">Flags</th>
                                        <th className="px-4 py-3 font-medium" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {models.data.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={8}
                                                className="px-4 py-8 text-center text-muted-foreground"
                                                data-testid="empty-models"
                                            >
                                                No models match the current filters.
                                            </td>
                                        </tr>
                                    )}
                                    {models.data.map((m) => (
                                        <tr key={m.id} data-testid={`model-row-${m.id}`}>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {m.vendor}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="truncate">
                                                    {m.display_name ?? m.name}
                                                </p>
                                                <p className="truncate font-mono text-xs text-muted-foreground">
                                                    {m.name}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {m.architecture_type ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {formatContext(m.context_length)}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {formatPrice(m.pricing_input_per_million)}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {formatPrice(m.pricing_output_per_million)}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                <div className="flex flex-wrap gap-1">
                                                    {m.manual_override && (
                                                        <span className="rounded border border-indigo-800 bg-indigo-900/40 px-1.5 py-0.5 text-indigo-200">
                                                            override
                                                        </span>
                                                    )}
                                                    {m.metadata_estimated && (
                                                        <span className="rounded border border-amber-800 bg-amber-900/40 px-1.5 py-0.5 text-amber-200">
                                                            estimated
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs">
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    size="sm"
                                                    className="mr-1"
                                                >
                                                    <Link
                                                        href={route('admin.models.edit', {
                                                            model: m.id,
                                                        })}
                                                        data-testid={`edit-model-${m.id}`}
                                                    >
                                                        Edit
                                                    </Link>
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPendingDelete(m)}
                                                    className="text-destructive hover:text-destructive"
                                                    data-testid={`delete-model-${m.id}`}
                                                >
                                                    Delete
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    {models.last_page > 1 && (
                        <nav
                            aria-label="Pagination"
                            className="flex flex-wrap justify-center gap-1"
                            data-testid="pagination"
                        >
                            {models.links.map((link, idx) => (
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
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                            ))}
                        </nav>
                    )}
                </div>

                <AlertDialog open={confirmRefresh} onOpenChange={setConfirmRefresh}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Refresh registry from OpenRouter?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Pulls the latest model list and pricing. This may take a few
                                seconds; manual_override rows are preserved.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={doRefresh} data-testid="confirm-refresh">
                                Refresh
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <AlertDialog
                    open={pendingDelete !== null}
                    onOpenChange={(open) => !open && setPendingDelete(null)}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete this model?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {pendingDelete &&
                                    `Removes ${pendingDelete.name} from the registry. Runs that
                                    used it stay intact, but no new runs can be submitted against
                                    it. Refreshing from OpenRouter will re-add it if it's still
                                    in upstream.`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={doDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                data-testid="confirm-delete-model"
                            >
                                Delete model
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </AppLayout>
        </>
    );
}
