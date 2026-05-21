import { cn } from '@/lib/utils';

/*
 * TokenPill (M13 chunk 2) — rounded rectangle representing a single
 * token in the inference pipeline.
 *
 * Per `docs/visualization.md` visual language: "Tokens = rounded
 * rectangles, colored by token ID hash." We hash the supplied
 * tokenId into an HSL hue (deterministic per token, so the same
 * token always gets the same color); saturation + lightness are
 * fixed for legibility on the slate-950 scene background.
 *
 * A11y caveat: the hue carries no information by itself — the
 * label text is the source of truth. WCAG 2.1 SC 1.4.1 "Use of
 * Color" is satisfied because every TokenPill displays its
 * string label inline.
 */

export interface TokenPillProps {
    /** The underlying token ID (integer). Drives the hue. */
    tokenId: number;
    /** The token's string representation. Displayed inside the pill. */
    label: string;
    /** Optional ID number to display under the label (used after BPE in Scene 3). */
    showId?: boolean;
    /** Compact mode for dense rows of tokens. */
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

/**
 * Stable u32 hash of a 32-bit signed integer. Deterministic across
 * runs + browsers (no Math.random / Date.now etc).
 *
 * xorshift32-based; not cryptographic — just a spreader so adjacent
 * token IDs land on visually distinct hues.
 */
export function tokenIdToHue(tokenId: number): number {
    let x = (tokenId | 0) ^ 0x9e3779b9;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // u32 modulo 360 → hue
    return (x >>> 0) % 360;
}

const SIZE_CLASSES: Record<NonNullable<TokenPillProps['size']>, string> = {
    sm: 'px-1.5 py-0.5 text-[10px] min-w-[24px]',
    md: 'px-2 py-1 text-xs min-w-[32px]',
    lg: 'px-3 py-1.5 text-sm min-w-[48px]',
};

export default function TokenPill({
    tokenId,
    label,
    showId = false,
    size = 'md',
    className,
}: TokenPillProps) {
    const hue = tokenIdToHue(tokenId);
    // Saturation + lightness picked to give good contrast on slate-950
    // without becoming so bright that adjacent pills bleed into one
    // another. The 22% lightness floor keeps reds + blues legible.
    const backgroundColor = `hsl(${hue}deg 55% 32%)`;
    const borderColor = `hsl(${hue}deg 60% 48%)`;
    const textColor = `hsl(${hue}deg 35% 92%)`;

    return (
        <span
            className={cn(
                'inline-flex flex-col items-center justify-center rounded-md border font-mono leading-tight whitespace-nowrap',
                SIZE_CLASSES[size],
                className,
            )}
            style={{ backgroundColor, borderColor, color: textColor }}
            data-testid="token-pill"
            data-token-id={tokenId}
            data-hue={hue}
            aria-label={`Token ${tokenId}: ${label}`}
            title={`Token ID: ${tokenId}`}
        >
            <span className="font-medium">{label}</span>
            {showId && <span className="text-[9px] opacity-75 tabular-nums">{tokenId}</span>}
        </span>
    );
}
