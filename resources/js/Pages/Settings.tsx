import { Head, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import { Button } from '@/Components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/Components/ui/card';
import { Label } from '@/Components/ui/label';
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
            <AppLayout title="Settings">
                <div className="p-6 md:p-8 max-w-2xl space-y-6">
                    <header>
                        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Profile and privacy preferences.
                        </p>
                    </header>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Privacy</CardTitle>
                            <CardDescription>
                                Control whether your prompt text is stored alongside each run.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form
                                onSubmit={handleSubmit}
                                className="space-y-6"
                                data-testid="settings-form"
                            >
                                <fieldset className="space-y-2">
                                    <div className="flex items-start gap-3">
                                        <input
                                            id="store_prompts"
                                            type="checkbox"
                                            checked={data.store_prompts}
                                            onChange={(e) =>
                                                setData('store_prompts', e.target.checked)
                                            }
                                            className="mt-1 h-4 w-4 rounded border-input"
                                            data-testid="store-prompts-checkbox"
                                        />
                                        <div className="flex-1">
                                            <Label
                                                htmlFor="store_prompts"
                                                className="cursor-pointer"
                                            >
                                                Store my prompts
                                            </Label>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                When enabled, your prompts are saved with each run
                                                so you can replay later. Turn off to keep only a
                                                hash — replays will still work but the prompt text
                                                won&apos;t be recoverable.
                                            </p>
                                        </div>
                                    </div>
                                    {errors.store_prompts && (
                                        <p role="alert" className="text-xs text-destructive">
                                            {errors.store_prompts}
                                        </p>
                                    )}
                                </fieldset>

                                <div className="flex items-center gap-3">
                                    <Button
                                        type="submit"
                                        disabled={processing}
                                        data-testid="settings-submit"
                                    >
                                        {processing ? 'Saving…' : 'Save'}
                                    </Button>
                                    {recentlySuccessful && flash?.status === 'settings-saved' && (
                                        <span
                                            className="text-xs text-emerald-400"
                                            data-testid="settings-saved"
                                        >
                                            Saved.
                                        </span>
                                    )}
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </AppLayout>
        </>
    );
}
