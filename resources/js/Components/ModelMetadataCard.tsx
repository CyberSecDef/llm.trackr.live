import { Card, CardContent } from '@/Components/ui/card';
import type { PickerModel } from '@/Components/ModelPicker';

/*
 * ModelMetadataCard (M7 chunk 7).
 *
 * Renders the full attribute set for the currently-selected model.
 * Two-column key/value grid; gracefully handles nulls (registry rows
 * with missing metadata get "—" instead of empty cells).
 *
 * Pricing is rendered inline as "$X.YZ / M tokens". MoE rows include
 * the active-experts breakdown ("8 (2 active)"); dense rows omit it.
 */

interface ModelMetadataCardProps {
    model: PickerModel | null;
}

function formatNumber(n: number | null): string {
    if (n === null || n === undefined) return '—';
    return n.toLocaleString();
}

function formatPrice(p: number | null): string {
    if (p === null || p === undefined) return '—';
    return `$${p.toFixed(2)} / M`;
}

function formatContextLength(n: number | null): string {
    if (!n) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K tokens`;
    return `${n} tokens`;
}

function formatArch(model: PickerModel): string {
    if (!model.architecture_type) return '—';
    if (model.architecture_type === 'moe' && model.moe_experts !== null) {
        const active = model.moe_active_experts ?? 0;
        return `MoE · ${model.moe_experts} experts (${active} active)`;
    }
    return model.architecture_type === 'moe' ? 'MoE' : 'Dense';
}

export default function ModelMetadataCard({ model }: ModelMetadataCardProps) {
    if (!model) return null;

    return (
        <Card data-testid="model-metadata-card">
            <CardContent className="p-4">
                <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {model.vendor}
                    </p>
                    <p className="text-sm font-medium">{model.display_name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground/80">{model.name}</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <Row label="Architecture" value={formatArch(model)} />
                    <Row label="Context" value={formatContextLength(model.context_length)} />
                    <Row label="Layers" value={formatNumber(model.layers)} />
                    <Row label="Hidden dim" value={formatNumber(model.hidden_dim)} />
                    <Row label="Attention heads" value={formatNumber(model.attention_heads)} />
                    <Row label="Position enc." value={model.position_encoding ?? '—'} />
                    <Row label="Input price" value={formatPrice(model.pricing_input_per_million)} />
                    <Row
                        label="Output price"
                        value={formatPrice(model.pricing_output_per_million)}
                    />
                </dl>
            </CardContent>
        </Card>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono text-foreground/90">{value}</dd>
        </div>
    );
}
