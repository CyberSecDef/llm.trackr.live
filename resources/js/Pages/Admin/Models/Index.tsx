import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
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

    const handleFilter = (e: FormEvent) => {
        e.preventDefault();
        get(route('admin.models.index'), { preserveState: true, preserveScroll: true });
    };

    const handleRefresh = () => {
        if (!confirm('Refresh the registry from OpenRouter? This may take a few seconds.')) {
            return;
        }
        router.post(route('admin.models.refresh'));
    };

    const handleDelete = (model: ModelRow) => {
        if (!confirm(`Delete ${model.name}? This cannot be undone.`)) {
            return;
        }
        router.delete(route('admin.models.destroy', { model: model.id }));
    };

    return (
        <>
            <Head title="Admin · Models" />
            <AppLayout>
                <div className="p-8 max-w-7xl">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Model Registry</h1>
                            <p className="mt-2 text-sm text-slate-400">
                                {models.total} {models.total === 1 ? 'model' : 'models'} registered.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded"
                        >
                            Refresh from OpenRouter
                        </button>
                    </div>

                    {flash?.status?.startsWith('refresh-complete') && (
                        <div className="mt-4 px-3 py-2 text-sm rounded border border-emerald-900/50 bg-emerald-950/40 text-emerald-200">
                            {flash.status.replace('refresh-complete:', '')}
                        </div>
                    )}
                    {flash?.status?.startsWith('model-updated:') && (
                        <div className="mt-4 px-3 py-2 text-sm rounded border border-emerald-900/50 bg-emerald-950/40 text-emerald-200">
                            Model updated.
                        </div>
                    )}
                    {flash?.status?.startsWith('model-deleted:') && (
                        <div className="mt-4 px-3 py-2 text-sm rounded border border-amber-900/50 bg-amber-950/40 text-amber-200">
                            Deleted {flash.status.replace('model-deleted:', '')}.
                        </div>
                    )}
                    {errors.refresh && (
                        <div
                            role="alert"
                            className="mt-4 px-3 py-2 text-sm rounded border border-red-900/50 bg-red-950/40 text-red-200"
                        >
                            {errors.refresh}
                        </div>
                    )}

                    <form onSubmit={handleFilter} className="mt-6 flex flex-wrap gap-2 items-end">
                        <div>
                            <label
                                htmlFor="search"
                                className="block text-xs uppercase tracking-wide text-slate-500"
                            >
                                Search
                            </label>
                            <input
                                id="search"
                                type="search"
                                value={data.search}
                                onChange={(e) => setData('search', e.target.value)}
                                placeholder="name or display name"
                                className="mt-1 w-64 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="vendor"
                                className="block text-xs uppercase tracking-wide text-slate-500"
                            >
                                Vendor
                            </label>
                            <select
                                id="vendor"
                                value={data.vendor}
                                onChange={(e) => setData('vendor', e.target.value)}
                                className="mt-1 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm"
                            >
                                <option value="">all</option>
                                {vendors.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor="architecture"
                                className="block text-xs uppercase tracking-wide text-slate-500"
                            >
                                Architecture
                            </label>
                            <select
                                id="architecture"
                                value={data.architecture}
                                onChange={(e) => setData('architecture', e.target.value)}
                                className="mt-1 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm"
                            >
                                <option value="">all</option>
                                <option value="dense">dense</option>
                                <option value="moe">moe</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            disabled={processing}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded text-sm"
                        >
                            Filter
                        </button>
                    </form>

                    <div className="mt-6 overflow-x-auto bg-slate-900 border border-slate-800 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
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
                            <tbody className="divide-y divide-slate-800">
                                {models.data.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={8}
                                            className="px-4 py-8 text-center text-slate-500"
                                        >
                                            No models match the current filters.
                                        </td>
                                    </tr>
                                )}
                                {models.data.map((m) => (
                                    <tr key={m.id}>
                                        <td className="px-4 py-3 font-mono text-xs">{m.vendor}</td>
                                        <td className="px-4 py-3">
                                            <p className="truncate">{m.display_name ?? m.name}</p>
                                            <p className="text-xs text-slate-500 truncate font-mono">
                                                {m.name}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            {m.architecture_type ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-mono">
                                            {formatContext(m.context_length)}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-mono">
                                            {formatPrice(m.pricing_input_per_million)}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-mono">
                                            {formatPrice(m.pricing_output_per_million)}
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div className="flex flex-wrap gap-1">
                                                {m.manual_override && (
                                                    <span className="px-1.5 py-0.5 rounded bg-indigo-900/40 border border-indigo-800 text-indigo-200">
                                                        override
                                                    </span>
                                                )}
                                                {m.metadata_estimated && (
                                                    <span className="px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-800 text-amber-200">
                                                        estimated
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs">
                                            <Link
                                                href={route('admin.models.edit', {
                                                    model: m.id,
                                                })}
                                                className="text-slate-400 hover:text-slate-200 mr-3"
                                            >
                                                Edit
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(m)}
                                                className="text-red-400 hover:text-red-200"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {models.last_page > 1 && (
                        <nav
                            aria-label="Pagination"
                            className="mt-4 flex flex-wrap gap-1 justify-center"
                        >
                            {models.links.map((link, idx) => (
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
