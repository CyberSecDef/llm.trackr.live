import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import type { FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';

interface ModelData {
    id: number;
    vendor: string;
    name: string;
    display_name: string | null;
    api_base_url: string | null;
    architecture_type: string | null;
    layers: number | null;
    hidden_dim: number | null;
    attention_heads: number | null;
    moe_experts: number | null;
    moe_active_experts: number | null;
    position_encoding: string | null;
    context_length: number | null;
    pricing_input_per_million: number | null;
    pricing_output_per_million: number | null;
    supports_streaming: boolean;
    supports_logprobs: boolean;
    supports_seed: boolean;
    chat_template: string | null;
    manual_override: boolean;
    metadata_estimated: boolean;
}

interface Props {
    model: ModelData;
    architectureTypes: string[];
    positionEncodings: string[];
}

export default function AdminModelEdit({ model, architectureTypes, positionEncodings }: Props) {
    const { data, setData, patch, processing, errors } = useForm({
        vendor: model.vendor,
        display_name: model.display_name ?? '',
        api_base_url: model.api_base_url ?? '',
        architecture_type: model.architecture_type ?? '',
        layers: model.layers,
        hidden_dim: model.hidden_dim,
        attention_heads: model.attention_heads,
        moe_experts: model.moe_experts,
        moe_active_experts: model.moe_active_experts,
        position_encoding: model.position_encoding ?? '',
        context_length: model.context_length,
        pricing_input_per_million: model.pricing_input_per_million,
        pricing_output_per_million: model.pricing_output_per_million,
        supports_streaming: model.supports_streaming,
        supports_logprobs: model.supports_logprobs,
        supports_seed: model.supports_seed,
        chat_template: model.chat_template ?? '',
        manual_override: model.manual_override,
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        patch(route('admin.models.update', { model: model.id }));
    };

    const selectClass =
        'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

    return (
        <>
            <Head title={`Edit ${model.name}`} />
            <AppLayout title="Admin · Models">
                <div className="p-6 md:p-8 max-w-4xl space-y-6">
                    <Button asChild variant="ghost" size="sm" className="-ml-2">
                        <Link href={route('admin.models.index')}>
                            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                            Back to model registry
                        </Link>
                    </Button>

                    <header>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {model.display_name ?? model.name}
                        </h1>
                        <p className="mt-1 font-mono text-sm text-muted-foreground">
                            {model.vendor}/{model.name}
                        </p>
                    </header>

                    {model.metadata_estimated && (
                        <div
                            className="rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-300"
                            data-testid="estimated-notice"
                        >
                            Architecture fields are estimated — the vendor doesn&apos;t publish
                            exact details. Edit + check &quot;manual override&quot; to lock in your
                            values.
                        </div>
                    )}

                    <Card>
                        <CardContent className="p-6">
                            <form
                                onSubmit={handleSubmit}
                                className="space-y-8"
                                data-testid="edit-model-form"
                            >
                                <Section title="Identity">
                                    <Field label="Vendor" error={errors.vendor}>
                                        <Input
                                            type="text"
                                            value={data.vendor}
                                            onChange={(e) => setData('vendor', e.target.value)}
                                            data-testid="vendor-input"
                                        />
                                    </Field>
                                    <Field label="Display name" error={errors.display_name}>
                                        <Input
                                            type="text"
                                            value={data.display_name}
                                            onChange={(e) =>
                                                setData('display_name', e.target.value)
                                            }
                                            data-testid="display-name-input"
                                        />
                                    </Field>
                                    <Field
                                        label="API base URL (override)"
                                        error={errors.api_base_url}
                                    >
                                        <Input
                                            type="url"
                                            value={data.api_base_url}
                                            onChange={(e) =>
                                                setData('api_base_url', e.target.value)
                                            }
                                            placeholder="https://api.example.com/v1"
                                        />
                                    </Field>
                                </Section>

                                <Section title="Architecture">
                                    <Field label="Type" error={errors.architecture_type}>
                                        <select
                                            value={data.architecture_type}
                                            onChange={(e) =>
                                                setData('architecture_type', e.target.value)
                                            }
                                            className={selectClass}
                                            data-testid="arch-type-select"
                                        >
                                            <option value="">(unknown)</option>
                                            {architectureTypes.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field label="Layers" error={errors.layers}>
                                        <NumberField
                                            value={data.layers}
                                            onChange={(v) => setData('layers', v)}
                                        />
                                    </Field>
                                    <Field label="Hidden dim" error={errors.hidden_dim}>
                                        <NumberField
                                            value={data.hidden_dim}
                                            onChange={(v) => setData('hidden_dim', v)}
                                        />
                                    </Field>
                                    <Field label="Attention heads" error={errors.attention_heads}>
                                        <NumberField
                                            value={data.attention_heads}
                                            onChange={(v) => setData('attention_heads', v)}
                                        />
                                    </Field>
                                    <Field label="MoE experts" error={errors.moe_experts}>
                                        <NumberField
                                            value={data.moe_experts}
                                            onChange={(v) => setData('moe_experts', v)}
                                        />
                                    </Field>
                                    <Field
                                        label="MoE active experts (top-k)"
                                        error={errors.moe_active_experts}
                                    >
                                        <NumberField
                                            value={data.moe_active_experts}
                                            onChange={(v) => setData('moe_active_experts', v)}
                                        />
                                    </Field>
                                    <Field
                                        label="Position encoding"
                                        error={errors.position_encoding}
                                    >
                                        <select
                                            value={data.position_encoding}
                                            onChange={(e) =>
                                                setData('position_encoding', e.target.value)
                                            }
                                            className={selectClass}
                                        >
                                            <option value="">(unknown)</option>
                                            {positionEncodings.map((p) => (
                                                <option key={p} value={p}>
                                                    {p}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                </Section>

                                <Section title="Capacity + pricing">
                                    <Field
                                        label="Context length (tokens)"
                                        error={errors.context_length}
                                    >
                                        <NumberField
                                            value={data.context_length}
                                            onChange={(v) => setData('context_length', v)}
                                        />
                                    </Field>
                                    <Field
                                        label="Price per million input tokens ($)"
                                        error={errors.pricing_input_per_million}
                                    >
                                        <DecimalField
                                            value={data.pricing_input_per_million}
                                            onChange={(v) =>
                                                setData('pricing_input_per_million', v)
                                            }
                                        />
                                    </Field>
                                    <Field
                                        label="Price per million output tokens ($)"
                                        error={errors.pricing_output_per_million}
                                    >
                                        <DecimalField
                                            value={data.pricing_output_per_million}
                                            onChange={(v) =>
                                                setData('pricing_output_per_million', v)
                                            }
                                        />
                                    </Field>
                                </Section>

                                <Section title="Capabilities">
                                    <Checkbox
                                        id="supports_streaming"
                                        label="Supports streaming"
                                        checked={data.supports_streaming}
                                        onChange={(v) => setData('supports_streaming', v)}
                                    />
                                    <Checkbox
                                        id="supports_logprobs"
                                        label="Supports logprobs"
                                        checked={data.supports_logprobs}
                                        onChange={(v) => setData('supports_logprobs', v)}
                                    />
                                    <Checkbox
                                        id="supports_seed"
                                        label="Supports seed"
                                        checked={data.supports_seed}
                                        onChange={(v) => setData('supports_seed', v)}
                                    />
                                </Section>

                                <Section title="Chat template">
                                    <div className="sm:col-span-2 space-y-1.5">
                                        <Textarea
                                            value={data.chat_template}
                                            onChange={(e) =>
                                                setData('chat_template', e.target.value)
                                            }
                                            rows={6}
                                            placeholder="(Optional) Jinja-style template for this model's chat format"
                                            className="font-mono text-xs"
                                            data-testid="chat-template-input"
                                        />
                                        {errors.chat_template && (
                                            <p role="alert" className="text-xs text-destructive">
                                                {errors.chat_template}
                                            </p>
                                        )}
                                    </div>
                                </Section>

                                <Section title="Refresh control">
                                    <Checkbox
                                        id="manual_override"
                                        label="Manual override — future automated refreshes will skip this row"
                                        checked={data.manual_override}
                                        onChange={(v) => setData('manual_override', v)}
                                    />
                                </Section>

                                <div className="flex items-center gap-3">
                                    <Button
                                        type="submit"
                                        disabled={processing}
                                        data-testid="save-model"
                                    >
                                        {processing ? 'Saving…' : 'Save changes'}
                                    </Button>
                                    <Button asChild variant="ghost" size="sm">
                                        <Link href={route('admin.models.index')}>Cancel</Link>
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </AppLayout>
        </>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{title}</legend>
            <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        </fieldset>
    );
}

function Field({
    label,
    children,
    error,
}: {
    label: string;
    children: React.ReactNode;
    error?: string;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
            {children}
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}

function NumberField({
    value,
    onChange,
}: {
    value: number | null;
    onChange: (v: number | null) => void;
}) {
    return (
        <Input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
    );
}

function DecimalField({
    value,
    onChange,
}: {
    value: number | null;
    onChange: (v: number | null) => void;
}) {
    return (
        <Input
            type="number"
            step="0.000001"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
    );
}

function Checkbox({
    id,
    label,
    checked,
    onChange,
}: {
    id: string;
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor={id} className="cursor-pointer">
                {label}
            </Label>
        </div>
    );
}
