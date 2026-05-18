import { Head, Link, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AppLayout from '@/Layouts/AppLayout';

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

    return (
        <>
            <Head title={`Edit ${model.name}`} />
            <AppLayout>
                <div className="p-8 max-w-4xl">
                    <Link
                        href={route('admin.models.index')}
                        className="text-xs text-slate-500 hover:text-slate-300"
                    >
                        ← Back to model registry
                    </Link>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight">
                        {model.display_name ?? model.name}
                    </h1>
                    <p className="mt-1 text-sm text-slate-400 font-mono">
                        {model.vendor}/{model.name}
                    </p>

                    {model.metadata_estimated && (
                        <p className="mt-3 text-xs text-amber-300 bg-amber-950/40 border border-amber-900/50 px-3 py-2 rounded">
                            Architecture fields are estimated — the vendor doesn&apos;t publish
                            exact details. Edit + check &quot;manual override&quot; to lock in your
                            values.
                        </p>
                    )}

                    <form
                        onSubmit={handleSubmit}
                        className="mt-6 space-y-8 bg-slate-900 border border-slate-800 rounded-lg p-6"
                    >
                        <Section title="Identity">
                            <Field
                                label="Vendor"
                                error={errors.vendor}
                                input={
                                    <input
                                        type="text"
                                        value={data.vendor}
                                        onChange={(e) => setData('vendor', e.target.value)}
                                        className={inputClass}
                                    />
                                }
                            />
                            <Field
                                label="Display name"
                                error={errors.display_name}
                                input={
                                    <input
                                        type="text"
                                        value={data.display_name}
                                        onChange={(e) => setData('display_name', e.target.value)}
                                        className={inputClass}
                                    />
                                }
                            />
                            <Field
                                label="API base URL (override)"
                                error={errors.api_base_url}
                                input={
                                    <input
                                        type="url"
                                        value={data.api_base_url}
                                        onChange={(e) => setData('api_base_url', e.target.value)}
                                        placeholder="https://api.example.com/v1"
                                        className={inputClass}
                                    />
                                }
                            />
                        </Section>

                        <Section title="Architecture">
                            <Field
                                label="Type"
                                error={errors.architecture_type}
                                input={
                                    <select
                                        value={data.architecture_type}
                                        onChange={(e) =>
                                            setData('architecture_type', e.target.value)
                                        }
                                        className={inputClass}
                                    >
                                        <option value="">(unknown)</option>
                                        {architectureTypes.map((t) => (
                                            <option key={t} value={t}>
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                }
                            />
                            <Field
                                label="Layers"
                                error={errors.layers}
                                input={
                                    <NumberField
                                        value={data.layers}
                                        onChange={(v) => setData('layers', v)}
                                    />
                                }
                            />
                            <Field
                                label="Hidden dim"
                                error={errors.hidden_dim}
                                input={
                                    <NumberField
                                        value={data.hidden_dim}
                                        onChange={(v) => setData('hidden_dim', v)}
                                    />
                                }
                            />
                            <Field
                                label="Attention heads"
                                error={errors.attention_heads}
                                input={
                                    <NumberField
                                        value={data.attention_heads}
                                        onChange={(v) => setData('attention_heads', v)}
                                    />
                                }
                            />
                            <Field
                                label="MoE experts"
                                error={errors.moe_experts}
                                input={
                                    <NumberField
                                        value={data.moe_experts}
                                        onChange={(v) => setData('moe_experts', v)}
                                    />
                                }
                            />
                            <Field
                                label="MoE active experts (top-k)"
                                error={errors.moe_active_experts}
                                input={
                                    <NumberField
                                        value={data.moe_active_experts}
                                        onChange={(v) => setData('moe_active_experts', v)}
                                    />
                                }
                            />
                            <Field
                                label="Position encoding"
                                error={errors.position_encoding}
                                input={
                                    <select
                                        value={data.position_encoding}
                                        onChange={(e) =>
                                            setData('position_encoding', e.target.value)
                                        }
                                        className={inputClass}
                                    >
                                        <option value="">(unknown)</option>
                                        {positionEncodings.map((p) => (
                                            <option key={p} value={p}>
                                                {p}
                                            </option>
                                        ))}
                                    </select>
                                }
                            />
                        </Section>

                        <Section title="Capacity + pricing">
                            <Field
                                label="Context length (tokens)"
                                error={errors.context_length}
                                input={
                                    <NumberField
                                        value={data.context_length}
                                        onChange={(v) => setData('context_length', v)}
                                    />
                                }
                            />
                            <Field
                                label="Price per million input tokens ($)"
                                error={errors.pricing_input_per_million}
                                input={
                                    <DecimalField
                                        value={data.pricing_input_per_million}
                                        onChange={(v) => setData('pricing_input_per_million', v)}
                                    />
                                }
                            />
                            <Field
                                label="Price per million output tokens ($)"
                                error={errors.pricing_output_per_million}
                                input={
                                    <DecimalField
                                        value={data.pricing_output_per_million}
                                        onChange={(v) => setData('pricing_output_per_million', v)}
                                    />
                                }
                            />
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
                            <textarea
                                value={data.chat_template}
                                onChange={(e) => setData('chat_template', e.target.value)}
                                rows={6}
                                className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono"
                                placeholder="(Optional) Jinja-style template for this model's chat format"
                            />
                            {errors.chat_template && (
                                <p className="text-xs text-red-400 mt-1">{errors.chat_template}</p>
                            )}
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
                            <button
                                type="submit"
                                disabled={processing}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium"
                            >
                                {processing ? 'Saving…' : 'Save changes'}
                            </button>
                            <Link
                                href={route('admin.models.index')}
                                className="text-sm text-slate-400 hover:text-slate-200"
                            >
                                Cancel
                            </Link>
                        </div>
                    </form>
                </div>
            </AppLayout>
        </>
    );
}

const inputClass =
    'w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-300">{title}</legend>
            <div className="grid sm:grid-cols-2 gap-4">{children}</div>
        </fieldset>
    );
}

function Field({ label, input, error }: { label: string; input: React.ReactNode; error?: string }) {
    return (
        <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
                {label}
            </label>
            {input}
            {error && (
                <p role="alert" className="text-xs text-red-400 mt-1">
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
        <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className={inputClass}
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
        <input
            type="number"
            step="0.000001"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className={inputClass}
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
            />
            <label htmlFor={id} className="text-sm cursor-pointer">
                {label}
            </label>
        </div>
    );
}
