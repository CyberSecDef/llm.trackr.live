import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { Slider } from '@/Components/ui/slider';
import { cn } from '@/lib/utils';

/*
 * ParameterControls (M7 chunk 8).
 *
 * Collapsible card with 5 inference parameter rows: temperature,
 * top_p, top_k, max_tokens, seed. Each row pairs a Slider with a
 * numeric Input — both controlled from the same `value`. Rows for
 * params the model's `supported_params` says aren't accepted are
 * disabled with a "(not supported)" hint instead of hidden, so the
 * UI shape stays the same across models.
 *
 * Defaults match SPEC §3.1.4 + RunService validation:
 *   temperature: 0.7   (range 0..2)
 *   top_p:       1.0   (range 0..1)
 *   top_k:       50    (range 0..500)
 *   max_tokens:  1024  (range 1..max(model.context_length))
 *   seed:        null  (random)
 *
 * `seed` is rendered as input-only (sliders for a 64-bit seed don't
 * make sense). A "Random" link nulls it back out.
 *
 * The parent component owns the `parameters` object and is told via
 * onChange when any value changes. A non-default value flips the
 * indicator dot in the header — so users can see at a glance that
 * the run won't use vendor defaults.
 */

export interface ParameterValues {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
    seed?: number | null;
}

export interface SupportedParams {
    temperature?: boolean;
    top_p?: boolean;
    top_k?: boolean;
    max_tokens?: boolean;
    seed?: boolean;
}

interface ParameterControlsProps {
    value: ParameterValues;
    onChange: (next: ParameterValues) => void;
    supported: SupportedParams | null | undefined;
    /** Max value for the max_tokens slider; usually the model's context_length. */
    maxTokensCeiling?: number | null;
}

export const PARAM_DEFAULTS = {
    temperature: 0.7,
    top_p: 1.0,
    top_k: 50,
    max_tokens: 1024,
} as const;

function isAtDefault(values: ParameterValues): boolean {
    return (
        (values.temperature ?? PARAM_DEFAULTS.temperature) === PARAM_DEFAULTS.temperature &&
        (values.top_p ?? PARAM_DEFAULTS.top_p) === PARAM_DEFAULTS.top_p &&
        (values.top_k ?? PARAM_DEFAULTS.top_k) === PARAM_DEFAULTS.top_k &&
        (values.max_tokens ?? PARAM_DEFAULTS.max_tokens) === PARAM_DEFAULTS.max_tokens &&
        (values.seed === undefined || values.seed === null)
    );
}

export default function ParameterControls({
    value,
    onChange,
    supported,
    maxTokensCeiling,
}: ParameterControlsProps) {
    const [open, setOpen] = useState(false);

    const update = <K extends keyof ParameterValues>(key: K, v: ParameterValues[K]) => {
        onChange({ ...value, [key]: v });
    };

    const reset = () => {
        onChange({ ...PARAM_DEFAULTS, seed: null });
    };

    const ceiling = maxTokensCeiling && maxTokensCeiling > 0 ? maxTokensCeiling : 8192;
    const atDefault = isAtDefault(value);

    // Treat missing supported_params as "everything supported" — older
    // registry rows might not have the field set.
    const isSupported = (key: keyof SupportedParams) => supported?.[key] ?? true;

    return (
        <Card data-testid="parameter-controls">
            <CardContent className="p-0">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full items-center gap-2 p-3 text-sm hover:bg-accent/40 transition-colors"
                    aria-expanded={open}
                    data-testid="parameter-controls-toggle"
                >
                    {open ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="font-medium">Parameters</span>
                    {!atDefault && (
                        <span
                            className="h-1.5 w-1.5 rounded-full bg-primary"
                            aria-label="Custom parameters set"
                            data-testid="parameter-custom-dot"
                        />
                    )}
                </button>
                {open && (
                    <div
                        className="space-y-4 border-t border-border p-4"
                        data-testid="parameter-controls-body"
                    >
                        <NumberParam
                            label="Temperature"
                            description="Randomness — higher = more creative."
                            min={0}
                            max={2}
                            step={0.05}
                            value={value.temperature ?? PARAM_DEFAULTS.temperature}
                            onChange={(v) => update('temperature', v)}
                            disabled={!isSupported('temperature')}
                            testidPrefix="temperature"
                        />
                        <NumberParam
                            label="Top-p"
                            description="Nucleus sampling cutoff."
                            min={0}
                            max={1}
                            step={0.05}
                            value={value.top_p ?? PARAM_DEFAULTS.top_p}
                            onChange={(v) => update('top_p', v)}
                            disabled={!isSupported('top_p')}
                            testidPrefix="top_p"
                        />
                        <NumberParam
                            label="Top-k"
                            description="Restrict to the K most-likely tokens."
                            min={0}
                            max={500}
                            step={1}
                            value={value.top_k ?? PARAM_DEFAULTS.top_k}
                            onChange={(v) => update('top_k', v)}
                            disabled={!isSupported('top_k')}
                            testidPrefix="top_k"
                            integer
                        />
                        <NumberParam
                            label="Max tokens"
                            description="Maximum response length to reserve."
                            min={1}
                            max={ceiling}
                            step={1}
                            value={value.max_tokens ?? PARAM_DEFAULTS.max_tokens}
                            onChange={(v) => update('max_tokens', v)}
                            disabled={!isSupported('max_tokens')}
                            testidPrefix="max_tokens"
                            integer
                        />
                        <SeedParam
                            value={value.seed ?? null}
                            onChange={(v) => update('seed', v)}
                            disabled={!isSupported('seed')}
                        />
                        <div className="flex justify-end pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={reset}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                data-testid="parameter-reset"
                            >
                                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                Reset to defaults
                            </button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

interface NumberParamProps {
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
    disabled?: boolean;
    integer?: boolean;
    testidPrefix: string;
}

function NumberParam({
    label,
    description,
    min,
    max,
    step,
    value,
    onChange,
    disabled,
    integer,
    testidPrefix,
}: NumberParamProps) {
    return (
        <div className="space-y-1.5" data-testid={`${testidPrefix}-row`}>
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{label}</span>
                {disabled ? (
                    <span
                        className="text-[10px] text-muted-foreground"
                        data-testid={`${testidPrefix}-unsupported`}
                    >
                        (not supported)
                    </span>
                ) : (
                    <span className="text-[10px] text-muted-foreground">{description}</span>
                )}
            </div>
            <div className="flex items-center gap-3">
                <Slider
                    min={min}
                    max={max}
                    step={step}
                    value={[value]}
                    onValueChange={(arr) => onChange(arr[0])}
                    disabled={disabled}
                    aria-label={label}
                    data-testid={`${testidPrefix}-slider`}
                    className={cn('flex-1', disabled && 'opacity-50')}
                />
                <Input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') return;
                        const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
                        if (Number.isFinite(parsed)) {
                            // Clamp on the way in so the slider value never
                            // exceeds its bounds (avoids Radix warnings).
                            const clamped = Math.max(min, Math.min(max, parsed));
                            onChange(clamped);
                        }
                    }}
                    disabled={disabled}
                    className="w-20 h-8 text-xs"
                    aria-label={`${label} value`}
                    data-testid={`${testidPrefix}-input`}
                />
            </div>
        </div>
    );
}

function SeedParam({
    value,
    onChange,
    disabled,
}: {
    value: number | null;
    onChange: (v: number | null) => void;
    disabled?: boolean;
}) {
    return (
        <div className="space-y-1.5" data-testid="seed-row">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">Seed</span>
                {disabled ? (
                    <span
                        className="text-[10px] text-muted-foreground"
                        data-testid="seed-unsupported"
                    >
                        (not supported)
                    </span>
                ) : (
                    <span className="text-[10px] text-muted-foreground">
                        Pin the random number generator for reproducible runs.
                    </span>
                )}
            </div>
            <div className="flex items-center gap-3">
                <Input
                    type="number"
                    value={value ?? ''}
                    placeholder="Random"
                    onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                            onChange(null);
                        } else {
                            const parsed = parseInt(raw, 10);
                            if (Number.isFinite(parsed)) onChange(parsed);
                        }
                    }}
                    disabled={disabled}
                    className="flex-1 h-8 text-xs"
                    aria-label="Seed value"
                    data-testid="seed-input"
                />
                {value !== null && !disabled && (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        data-testid="seed-randomize"
                    >
                        Random
                    </button>
                )}
            </div>
        </div>
    );
}
