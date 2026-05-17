import { Head, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import type { PageProps } from '@/types';

interface Props {
    storePrompts: boolean;
}

export default function Settings({ storePrompts }: Props) {
    const { flash } = usePage<PageProps & { flash?: { status?: string } }>().props;
    const { data, setData, patch, processing, errors, recentlySuccessful } = useForm({
        store_prompts: storePrompts,
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        patch(route('settings.update'), { preserveScroll: true });
    };

    return (
        <>
            <Head title="Settings" />
            <AppLayout>
                <div className="p-8 max-w-2xl">
                    <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                    <p className="mt-3 text-sm text-slate-400">Profile and privacy preferences.</p>

                    <form
                        onSubmit={handleSubmit}
                        className="mt-8 space-y-6 bg-slate-900 border border-slate-800 rounded-lg p-6"
                    >
                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">Privacy</legend>
                            <div className="flex items-start gap-3">
                                <input
                                    id="store_prompts"
                                    type="checkbox"
                                    checked={data.store_prompts}
                                    onChange={(e) => setData('store_prompts', e.target.checked)}
                                    className="mt-1"
                                />
                                <label htmlFor="store_prompts" className="text-sm cursor-pointer">
                                    <span className="block">Store my prompts</span>
                                    <span className="block text-xs text-slate-500 mt-1">
                                        When enabled, your prompts are saved with each run so you
                                        can replay later. Turn off to keep only a hash — replays
                                        will still work but the prompt text won&apos;t be
                                        recoverable.
                                    </span>
                                </label>
                            </div>
                            {errors.store_prompts && (
                                <p role="alert" className="text-xs text-red-400">
                                    {errors.store_prompts}
                                </p>
                            )}
                        </fieldset>

                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={processing}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium"
                            >
                                {processing ? 'Saving…' : 'Save'}
                            </button>
                            {recentlySuccessful && flash?.status === 'settings-saved' && (
                                <span className="text-xs text-emerald-400">Saved.</span>
                            )}
                        </div>
                    </form>
                </div>
            </AppLayout>
        </>
    );
}
