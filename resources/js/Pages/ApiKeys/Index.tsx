import { Head, router, useForm, usePage } from '@inertiajs/react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
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

    // We track which row a user is asking to delete; the AlertDialog
    // opens for that row only. `null` = no dialog open.
    const [pendingDelete, setPendingDelete] = useState<ApiKeyRow | null>(null);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post(route('api-keys.store'), {
            preserveScroll: true,
            onSuccess: () => reset('key', 'label'),
        });
    };

    const confirmDelete = () => {
        if (!pendingDelete) return;
        router.delete(route('api-keys.destroy', { apiKey: pendingDelete.id }), {
            preserveScroll: true,
            onFinish: () => setPendingDelete(null),
        });
    };

    return (
        <>
            <Head title="API Keys" />
            <AppLayout title="API Keys">
                <div className="p-6 md:p-8 max-w-4xl space-y-6">
                    <header>
                        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Per-vendor keys you supply for inference calls. Keys are encrypted at
                            rest and never shown again after you add them. To replace a key, delete
                            the existing one and add a new one.
                        </p>
                    </header>

                    {flash?.status === 'api-key-added' && (
                        <div
                            className="rounded-md border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200"
                            data-testid="api-key-added"
                        >
                            Key added.
                        </div>
                    )}
                    {flash?.status?.startsWith('api-key-deleted:') && (
                        <div
                            className="rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-200"
                            data-testid="api-key-deleted"
                        >
                            Deleted {flash.status.replace('api-key-deleted:', '')} key.
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Add a key</CardTitle>
                            <CardDescription>
                                Pick the vendor, optionally tag it with a label, and paste the
                                credential. It&apos;s encrypted before it hits the database.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form
                                onSubmit={handleSubmit}
                                className="space-y-4"
                                data-testid="add-key-form"
                            >
                                <div className="grid gap-3 sm:grid-cols-3">
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
                                            data-testid="vendor-select"
                                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        >
                                            {supportedVendors.map((v) => (
                                                <option key={v} value={v}>
                                                    {v}
                                                </option>
                                            ))}
                                        </select>
                                        {errors.vendor && (
                                            <p role="alert" className="text-xs text-destructive">
                                                {errors.vendor}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label
                                            htmlFor="label"
                                            className="text-xs uppercase tracking-wide text-muted-foreground"
                                        >
                                            Label (optional)
                                        </Label>
                                        <Input
                                            id="label"
                                            type="text"
                                            value={data.label}
                                            onChange={(e) => setData('label', e.target.value)}
                                            placeholder="personal, work, …"
                                            data-testid="label-input"
                                        />
                                        {errors.label && (
                                            <p role="alert" className="text-xs text-destructive">
                                                {errors.label}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label
                                            htmlFor="key"
                                            className="text-xs uppercase tracking-wide text-muted-foreground"
                                        >
                                            Key
                                        </Label>
                                        <Input
                                            id="key"
                                            type="password"
                                            value={data.key}
                                            onChange={(e) => setData('key', e.target.value)}
                                            placeholder="sk-…"
                                            autoComplete="off"
                                            className="font-mono"
                                            data-testid="key-input"
                                        />
                                        {errors.key && (
                                            <p role="alert" className="text-xs text-destructive">
                                                {errors.key}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <Button
                                        type="submit"
                                        disabled={processing}
                                        data-testid="add-key-submit"
                                    >
                                        {processing ? 'Saving…' : 'Add key'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full text-sm" data-testid="keys-table">
                                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Vendor</th>
                                        <th className="px-4 py-3 font-medium">Label</th>
                                        <th className="px-4 py-3 font-medium">Key</th>
                                        <th className="px-4 py-3 font-medium">Last used</th>
                                        <th className="px-4 py-3 font-medium" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {apiKeys.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-8 text-center text-muted-foreground"
                                                data-testid="empty-keys"
                                            >
                                                No keys yet. Add one above to start submitting runs.
                                            </td>
                                        </tr>
                                    )}
                                    {apiKeys.map((k) => (
                                        <tr key={k.id} data-testid={`key-row-${k.id}`}>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {k.vendor}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {k.label ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {k.masked}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {k.last_used_at
                                                    ? new Date(k.last_used_at).toLocaleDateString()
                                                    : 'never'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPendingDelete(k)}
                                                    className="text-destructive hover:text-destructive"
                                                    data-testid={`delete-key-${k.id}`}
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
                </div>

                {/*
                    Single AlertDialog driven by `pendingDelete` state.
                    Mounted at the page level so the row's Delete button
                    just sets state — no per-row dialog instances.
                */}
                <AlertDialog
                    open={pendingDelete !== null}
                    onOpenChange={(open) => !open && setPendingDelete(null)}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete this API key?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {pendingDelete &&
                                    `Removes the ${pendingDelete.vendor}${
                                        pendingDelete.label ? ` (${pendingDelete.label})` : ''
                                    } key. You can re-add it later — the key text itself isn't
                                    recoverable from our side once deleted.`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={confirmDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                data-testid="confirm-delete-key"
                            >
                                Delete key
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </AppLayout>
        </>
    );
}
