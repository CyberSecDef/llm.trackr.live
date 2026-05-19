import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/Components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/Components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';
import { cn } from '@/lib/utils';

/*
 * ModelPicker (M7 chunk 7).
 *
 * Searchable + filterable combobox for the prompt-input footer. Built
 * on shadcn's Command + Popover stack — keyboard-first, ARIA-correct,
 * fuzzy-match search over display_name + vendor.
 *
 * Filters: Dense / MoE / All arch toggle, vendor multi-chip. "Size"
 * was scoped out (chunk-7 decision); context_length is shown as a
 * sortable column instead. Caller passes a flat list; we group by
 * vendor in the Command list.
 *
 * Returns the selected model's id via `onChange`; receives the
 * currently-selected `value` so it stays controlled.
 */

export interface PickerModel {
    id: number;
    vendor: string;
    name: string;
    display_name: string;
    architecture_type: string | null;
    position_encoding: string | null;
    layers: number | null;
    hidden_dim: number | null;
    attention_heads: number | null;
    moe_experts: number | null;
    moe_active_experts: number | null;
    context_length: number | null;
    pricing_input_per_million: number | null;
    pricing_output_per_million: number | null;
    // Optional + nullable so older fixtures + registry rows without
    // the column set still typecheck; ParameterControls falls back
    // to "all params supported" when missing.
    supported_params?: {
        temperature?: boolean;
        top_p?: boolean;
        top_k?: boolean;
        max_tokens?: boolean;
        seed?: boolean;
    } | null;
}

interface ModelPickerProps {
    models: PickerModel[];
    value: number;
    onChange: (modelId: number) => void;
    'data-testid'?: string;
}

type ArchFilter = 'all' | 'dense' | 'moe';

function formatContextLength(n: number | null): string {
    if (!n) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
}

export default function ModelPicker({
    models,
    value,
    onChange,
    'data-testid': testId,
}: ModelPickerProps) {
    const [open, setOpen] = useState(false);
    const [archFilter, setArchFilter] = useState<ArchFilter>('all');
    const [vendorFilter, setVendorFilter] = useState<Set<string>>(new Set());

    const vendors = useMemo(
        () => Array.from(new Set(models.map((m) => m.vendor))).sort(),
        [models],
    );

    const filtered = useMemo(() => {
        return models.filter((model) => {
            if (archFilter === 'dense' && model.architecture_type !== 'dense') return false;
            if (archFilter === 'moe' && model.architecture_type !== 'moe') return false;
            if (vendorFilter.size > 0 && !vendorFilter.has(model.vendor)) return false;
            return true;
        });
    }, [models, archFilter, vendorFilter]);

    const grouped = useMemo(() => {
        const map: Record<string, PickerModel[]> = {};
        for (const model of filtered) {
            (map[model.vendor] ??= []).push(model);
        }
        return map;
    }, [filtered]);

    const selected = models.find((m) => m.id === value);

    const toggleVendor = (vendor: string) => {
        setVendorFilter((prev) => {
            const next = new Set(prev);
            if (next.has(vendor)) {
                next.delete(vendor);
            } else {
                next.add(vendor);
            }
            return next;
        });
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label="Select model"
                    className="w-[260px] justify-between"
                    data-testid={testId ?? 'model-picker-trigger'}
                >
                    <span className="truncate">
                        {selected ? selected.display_name : 'Select a model…'}
                    </span>
                    <ChevronsUpDown
                        className="ml-2 h-4 w-4 shrink-0 opacity-50"
                        aria-hidden="true"
                    />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0" align="start">
                <div className="border-b p-2 space-y-2" data-testid="model-picker-filters">
                    <div
                        className="flex rounded-md border border-border"
                        role="tablist"
                        aria-label="Architecture filter"
                        data-testid="arch-filter"
                    >
                        {(['all', 'dense', 'moe'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={archFilter === value}
                                onClick={() => setArchFilter(value)}
                                className={cn(
                                    'flex-1 px-2 py-1 text-xs first:rounded-l-md last:rounded-r-md transition-colors',
                                    archFilter === value
                                        ? 'bg-accent text-accent-foreground'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                                )}
                            >
                                {value === 'all' ? 'All' : value === 'dense' ? 'Dense' : 'MoE'}
                            </button>
                        ))}
                    </div>
                    {vendors.length > 1 && (
                        <div className="flex flex-wrap gap-1" data-testid="vendor-chips">
                            {vendors.map((vendor) => (
                                <button
                                    key={vendor}
                                    type="button"
                                    onClick={() => toggleVendor(vendor)}
                                    aria-pressed={vendorFilter.has(vendor)}
                                    className={cn(
                                        'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors',
                                        vendorFilter.has(vendor)
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:bg-accent',
                                    )}
                                >
                                    {vendor}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <Command>
                    <CommandInput placeholder="Search models…" />
                    <CommandList>
                        <CommandEmpty>No models match your filters.</CommandEmpty>
                        {Object.entries(grouped).map(([vendor, modelsInVendor]) => (
                            <CommandGroup key={vendor} heading={vendor}>
                                {modelsInVendor.map((model) => (
                                    <CommandItem
                                        key={model.id}
                                        // cmdk uses `value` for fuzzy match; include
                                        // display_name + name so both are searchable.
                                        value={`${model.display_name} ${model.name}`}
                                        onSelect={() => {
                                            onChange(model.id);
                                            setOpen(false);
                                        }}
                                        data-testid={`model-option-${model.id}`}
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                value === model.id ? 'opacity-100' : 'opacity-0',
                                            )}
                                            aria-hidden="true"
                                        />
                                        <span className="flex-1 truncate">
                                            {model.display_name}
                                        </span>
                                        <span className="ml-2 text-[10px] text-muted-foreground">
                                            {formatContextLength(model.context_length)}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
