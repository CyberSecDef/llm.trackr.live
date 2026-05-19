import { Head, Link, router, useForm } from '@inertiajs/react';
import { Archive, ArchiveRestore, ArrowLeft, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { Textarea } from '@/Components/ui/textarea';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/Components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/*
 * /threads/{id} (M7 chunk 5).
 *
 * Three regions vertically:
 *  - Header: title (inline-editable), archived badge, action menu
 *    (Archive/Unarchive, Edit title, Delete with confirm).
 *  - Transcript: read-only list of runs in sequence_in_thread order.
 *    Each run renders as a "user prompt → assistant output" pair with
 *    a status badge. Live streaming integration (useRunStream into a
 *    right pane) lands in chunk 6.
 *  - Footer: prompt input + native model <select> + Submit. The full
 *    prompt-input panel (autosize, token counter, context warning)
 *    lands in chunks 6–8; this is the bare-minimum so the page is
 *    usable end-to-end.
 *
 * Empty states cover: no API key (link to /api-keys), no usable
 * models (the user has a key but the registry has nothing for that
 * vendor — rare but possible).
 */

interface RunRow {
    id: number;
    sequence_in_thread: number;
    status: 'pending' | 'streaming' | 'complete' | 'error';
    prompt: string | null;
    output_text: string | null;
    error_message: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    duration_ms: number | null;
    estimated_cost: number | null;
    model_id: number;
    created_at: string | null;
}

interface UsableModel {
    id: number;
    vendor: string;
    name: string;
    display_name: string;
    context_length: number | null;
}

interface ThreadShowProps {
    thread: {
        id: number;
        title: string | null;
        archived: boolean;
        tags: string[];
        last_activity_at: string | null;
        created_at: string | null;
        default_model_id: number | null;
    };
    runs: RunRow[];
    usable_models: UsableModel[];
    has_api_keys: boolean;
}

const STATUS_LABEL: Record<RunRow['status'], string> = {
    pending: 'Pending',
    streaming: 'Streaming',
    complete: 'Complete',
    error: 'Error',
};
const STATUS_CLASSES: Record<RunRow['status'], string> = {
    pending: 'bg-muted text-muted-foreground',
    streaming: 'bg-blue-500/15 text-blue-300',
    complete: 'bg-emerald-500/15 text-emerald-300',
    error: 'bg-destructive/20 text-destructive-foreground',
};

export default function ThreadShow({ thread, runs, usable_models, has_api_keys }: ThreadShowProps) {
    return (
        <>
            <Head title={thread.title || `Thread #${thread.id}`} />
            <AppLayout title="Thread">
                <div className="p-6 md:p-8 max-w-5xl space-y-6">
                    <BackLink />
                    <ThreadHeader thread={thread} />
                    <Transcript runs={runs} />
                    <PromptFooter
                        threadId={thread.id}
                        usableModels={usable_models}
                        hasApiKeys={has_api_keys}
                        defaultModelId={thread.default_model_id}
                    />
                </div>
            </AppLayout>
        </>
    );
}

function BackLink() {
    return (
        <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/threads">
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                All threads
            </Link>
        </Button>
    );
}

function ThreadHeader({ thread }: { thread: ThreadShowProps['thread'] }) {
    const [editing, setEditing] = useState(false);
    const titleForm = useForm({ title: thread.title ?? '' });

    const submitTitle = (e: FormEvent) => {
        e.preventDefault();
        titleForm.patch(`/threads/${thread.id}`, {
            onSuccess: () => setEditing(false),
        });
    };

    const toggleArchive = () => {
        router.patch(
            `/threads/${thread.id}`,
            { archived: !thread.archived },
            { preserveScroll: true },
        );
    };

    const destroy = () => {
        router.delete(`/threads/${thread.id}`);
    };

    return (
        <header className="space-y-3" data-testid="thread-header">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                    {editing ? (
                        <form
                            onSubmit={submitTitle}
                            className="flex items-center gap-2"
                            data-testid="title-form"
                        >
                            <Input
                                value={titleForm.data.title}
                                onChange={(e) => titleForm.setData('title', e.target.value)}
                                aria-label="Thread title"
                                // The autofocus is intentional: the user just
                                // clicked an explicit "edit title" button, so
                                // moving focus into the field is the expected
                                // next interaction.
                                // eslint-disable-next-line jsx-a11y/no-autofocus
                                autoFocus
                                maxLength={200}
                            />
                            <Button type="submit" size="sm" disabled={titleForm.processing}>
                                Save
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    titleForm.setData('title', thread.title ?? '');
                                    setEditing(false);
                                }}
                            >
                                Cancel
                            </Button>
                        </form>
                    ) : (
                        <h1 className="text-2xl font-bold tracking-tight truncate">
                            {thread.title || 'Untitled thread'}
                        </h1>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                        {thread.archived && (
                            <span className="mr-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                                archived
                            </span>
                        )}
                        Created{' '}
                        {thread.created_at ? new Date(thread.created_at).toLocaleString() : '—'}
                    </p>
                </div>

                {!editing && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(true)}
                            data-testid="edit-title"
                        >
                            <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                            Title
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleArchive}
                            data-testid="toggle-archive"
                        >
                            {thread.archived ? (
                                <>
                                    <ArchiveRestore className="mr-1 h-3 w-3" aria-hidden="true" />
                                    Unarchive
                                </>
                            ) : (
                                <>
                                    <Archive className="mr-1 h-3 w-3" aria-hidden="true" />
                                    Archive
                                </>
                            )}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    data-testid="delete-trigger"
                                >
                                    <Trash2 className="mr-1 h-3 w-3" aria-hidden="true" />
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this thread?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This permanently removes the thread and all of its runs.
                                        This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={destroy}
                                        data-testid="delete-confirm"
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        Delete thread
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}
            </div>
        </header>
    );
}

function Transcript({ runs }: { runs: RunRow[] }) {
    if (runs.length === 0) {
        return (
            <Card className="border-dashed bg-card/40 text-center" data-testid="empty-transcript">
                <CardContent className="py-10">
                    <p className="text-sm text-muted-foreground">
                        No prompts yet. Type your first one below to get started.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <section className="space-y-4" data-testid="transcript">
            {runs.map((run) => (
                <Card key={run.id} data-testid={`run-${run.id}`}>
                    <CardContent className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                Run #{run.sequence_in_thread}
                            </p>
                            <span
                                className={cn(
                                    'rounded-full px-2 py-0.5 text-xs',
                                    STATUS_CLASSES[run.status],
                                )}
                            >
                                {STATUS_LABEL[run.status]}
                            </span>
                        </div>

                        {run.prompt !== null && (
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    You
                                </p>
                                <p className="whitespace-pre-wrap text-sm">{run.prompt}</p>
                            </div>
                        )}

                        {run.output_text !== null && (
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Assistant
                                </p>
                                <p className="whitespace-pre-wrap text-sm">{run.output_text}</p>
                            </div>
                        )}

                        {run.status === 'error' && run.error_message && (
                            <p className="text-xs text-destructive">{run.error_message}</p>
                        )}

                        {(run.input_tokens !== null || run.output_tokens !== null) && (
                            <p className="text-xs text-muted-foreground">
                                {run.input_tokens ?? 0} in · {run.output_tokens ?? 0} out
                                {run.duration_ms !== null && ` · ${run.duration_ms}ms`}
                                {run.estimated_cost !== null &&
                                    ` · $${run.estimated_cost.toFixed(4)}`}
                            </p>
                        )}
                    </CardContent>
                </Card>
            ))}
        </section>
    );
}

function PromptFooter({
    threadId,
    usableModels,
    hasApiKeys,
    defaultModelId,
}: {
    threadId: number;
    usableModels: UsableModel[];
    hasApiKeys: boolean;
    defaultModelId: number | null;
}) {
    if (!hasApiKeys) {
        return (
            <Card className="border-amber-500/40 bg-amber-500/5" data-testid="no-api-key-footer">
                <CardContent className="flex items-center gap-3 p-4">
                    <KeyRound className="h-5 w-5 text-amber-400 flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">
                            Add an API key to start submitting prompts.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Bring-your-own-key — pick a vendor and paste the credential.
                        </p>
                    </div>
                    <Button asChild size="sm">
                        <Link href="/api-keys">API Keys</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (usableModels.length === 0) {
        return (
            <Card className="border-amber-500/40 bg-amber-500/5" data-testid="no-usable-models">
                <CardContent className="p-4 text-sm">
                    You have an API key on file but the registry doesn&apos;t have any models for
                    your vendor(s). An admin can refresh the registry from the Models page.
                </CardContent>
            </Card>
        );
    }

    return (
        <PromptForm
            threadId={threadId}
            usableModels={usableModels}
            defaultModelId={defaultModelId}
        />
    );
}

function PromptForm({
    threadId,
    usableModels,
    defaultModelId,
}: {
    threadId: number;
    usableModels: UsableModel[];
    defaultModelId: number | null;
}) {
    // Pick the thread's default model, else the first usable one.
    const initialModelId =
        defaultModelId && usableModels.find((m) => m.id === defaultModelId)
            ? defaultModelId
            : (usableModels[0]?.id ?? 0);

    const form = useForm({
        prompt: '',
        model_id: initialModelId,
        parameters: { temperature: 0.7 },
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`/threads/${threadId}/runs`, {
            onSuccess: () => form.reset('prompt'),
        });
    };

    // Group models by vendor for the <optgroup> structure — easier to
    // skim than a flat list when the user has multiple vendors.
    const grouped = usableModels.reduce<Record<string, UsableModel[]>>((acc, model) => {
        (acc[model.vendor] ??= []).push(model);
        return acc;
    }, {});

    return (
        <Card data-testid="prompt-form">
            <CardContent className="p-4">
                <form onSubmit={submit} className="space-y-3">
                    <Textarea
                        value={form.data.prompt}
                        onChange={(e) => form.setData('prompt', e.target.value)}
                        placeholder="Type your prompt…"
                        aria-label="Prompt"
                        data-testid="prompt-textarea"
                        rows={4}
                    />
                    {form.errors.prompt && (
                        <p className="text-xs text-destructive">{form.errors.prompt}</p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="text-xs text-muted-foreground" htmlFor="model-select">
                            Model
                        </label>
                        <select
                            id="model-select"
                            value={form.data.model_id || ''}
                            onChange={(e) => form.setData('model_id', Number(e.target.value))}
                            data-testid="model-select"
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            {Object.entries(grouped).map(([vendor, models]) => (
                                <optgroup key={vendor} label={vendor}>
                                    {models.map((model) => (
                                        <option key={model.id} value={model.id}>
                                            {model.display_name}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <div className="flex-1" />
                        <Button
                            type="submit"
                            disabled={form.processing || form.data.prompt.trim() === ''}
                            data-testid="submit-prompt"
                        >
                            Submit
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
