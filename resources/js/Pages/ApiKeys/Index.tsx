import { Head, router, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import type { PageProps } from '@/types';

interface ApiKeyRow {
    id: number;
    vendor: string;
    label: string | null;
    last_four: string;
    masked: string;
    last_used_at: string | null;
    created_at: string | null;
}

interface Props {
    apiKeys: ApiKeyRow[];
    supportedVendors: string[];
}

export default function ApiKeysIndex({ apiKeys, supportedVendors }: Props) {
    const { flash } = usePage<PageProps & { flash?: { status?: string } }>().props;
    const { data, setData, post, processing, errors, reset } = useForm({
        vendor: supportedVendors[0] ?? '',
        label: '',
        key: '',
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post(route('api-keys.store'), {
            preserveScroll: true,
            onSuccess: () => reset('key', 'label'),
        });
    };

    const handleDelete = (row: ApiKeyRow) => {
        const labelHint = row.label ? ` (${row.label})` : '';
        if (!confirm(`Delete ${row.vendor}${labelHint}? You can re-add it later.`)) {
            return;
        }
        router.delete(route('api-keys.destroy', { apiKey: row.id }), {
            preserveScroll: true,
        });
    };

    return (
        <>
            <Head title="API Keys" />
            <AppLayout>
                <div className="p-8 max-w-4xl">
                    <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
                    <p className="mt-3 text-sm text-slate-400">
                        Per-vendor keys you supply for the inference calls. Keys are encrypted at
                        rest and never shown again after you add them. To replace a key, delete the
                        existing one and add a new one.
                    </p>

                    {flash?.status === 'api-key-added' && (
                        <div className="mt-4 px-3 py-2 text-sm rounded border border-emerald-900/50 bg-emerald-950/40 text-emerald-200">
                            Key added.
                        </div>
                    )}
                    {flash?.status?.startsWith('api-key-deleted:') && (
                        <div className="mt-4 px-3 py-2 text-sm rounded border border-amber-900/50 bg-amber-950/40 text-amber-200">
                            Deleted {flash.status.replace('api-key-deleted:', '')} key.
                        </div>
                    )}

                    <form
                        onSubmit={handleSubmit}
                        className="mt-6 space-y-4 bg-slate-900 border border-slate-800 rounded-lg p-6"
                    >
                        <div className="grid sm:grid-cols-3 gap-3">
                            <div>
                                <label
                                    htmlFor="vendor"
                                    className="block text-xs uppercase tracking-wide text-slate-500 mb-1"
                                >
                                    Vendor
                                </label>
                                <select
                                    id="vendor"
                                    value={data.vendor}
                                    onChange={(e) => setData('vendor', e.target.value)}
                                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm"
                                >
                                    {supportedVendors.map((v) => (
                                        <option key={v} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                                {errors.vendor && (
                                    <p role="alert" className="text-xs text-red-400 mt-1">
                                        {errors.vendor}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label
                                    htmlFor="label"
                                    className="block text-xs uppercase tracking-wide text-slate-500 mb-1"
                                >
                                    Label (optional)
                                </label>
                                <input
                                    id="label"
                                    type="text"
                                    value={data.label}
                                    onChange={(e) => setData('label', e.target.value)}
                                    placeholder="personal, work, …"
                                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm"
                                />
                                {errors.label && (
                                    <p role="alert" className="text-xs text-red-400 mt-1">
                                        {errors.label}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label
                                    htmlFor="key"
                                    className="block text-xs uppercase tracking-wide text-slate-500 mb-1"
                                >
                                    Key
                                </label>
                                <input
                                    id="key"
                                    type="password"
                                    value={data.key}
                                    onChange={(e) => setData('key', e.target.value)}
                                    placeholder="sk-…"
                                    autoComplete="off"
                                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm font-mono"
                                />
                                {errors.key && (
                                    <p role="alert" className="text-xs text-red-400 mt-1">
                                        {errors.key}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div>
                            <button
                                type="submit"
                                disabled={processing}
                                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded"
                            >
                                {processing ? 'Saving…' : 'Add key'}
                            </button>
                        </div>
                    </form>

                    <div className="mt-8 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Vendor</th>
                                    <th className="px-4 py-3 font-medium">Label</th>
                                    <th className="px-4 py-3 font-medium">Key</th>
                                    <th className="px-4 py-3 font-medium">Last used</th>
                                    <th className="px-4 py-3 font-medium" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {apiKeys.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="px-4 py-8 text-center text-slate-500"
                                        >
                                            No keys yet. Add one above to start submitting runs.
                                        </td>
                                    </tr>
                                )}
                                {apiKeys.map((k) => (
                                    <tr key={k.id}>
                                        <td className="px-4 py-3 font-mono text-xs">{k.vendor}</td>
                                        <td className="px-4 py-3 text-xs text-slate-400">
                                            {k.label ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">{k.masked}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">
                                            {k.last_used_at
                                                ? new Date(k.last_used_at).toLocaleDateString()
                                                : 'never'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs">
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(k)}
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
                </div>
            </AppLayout>
        </>
    );
}
