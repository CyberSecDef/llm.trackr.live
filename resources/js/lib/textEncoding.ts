/*
 * textEncoding (M13 chunk 3a) — UTF-8 char → bytes helper for
 * Scene 1 (chars → bytes) of the cinematic visualization.
 *
 * Browser `TextEncoder` is the universal pre-installed primitive
 * (Chrome / Firefox / Edge / Safari all expose it). No npm dep
 * required for the byte-level animation.
 *
 * The returned shape carries enough information to animate the
 * "bytes != characters" teaching beat: every character knows
 * which contiguous bytes it expanded into, so Scene 1 can flip
 * `'😀'` into `[240, 159, 152, 128]` with a visible 4-byte split
 * while `'h'` stays as a single byte.
 */

const utf8Encoder: TextEncoder | null =
    typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

export interface CharByteMapping {
    /** Source character (1+ UTF-16 code units; emoji are 2 code units). */
    char: string;
    /** UTF-8 byte values, length 1-4. */
    bytes: number[];
}

export function charsToBytes(text: string): CharByteMapping[] {
    if (!utf8Encoder) {
        // SSR / non-DOM context. Return the char list with empty
        // bytes — Scene 1 falls back to the "skip" path.
        return Array.from(text, (char) => ({ char, bytes: [] }));
    }

    const result: CharByteMapping[] = [];
    // `Array.from(text)` iterates over code points (handles surrogate
    // pairs) — `text[i]` would split a 2-code-unit emoji into two
    // separate "chars."
    for (const char of Array.from(text)) {
        const bytes = Array.from(utf8Encoder.encode(char));
        result.push({ char, bytes });
    }
    return result;
}

/** Flatten the per-char mapping into a single byte stream + the
 *  start index of each char's byte span. Lets Scene 1 animate
 *  each char's "split into 2-4 bytes" beat without re-iterating. */
export function flattenBytes(mapping: readonly CharByteMapping[]): {
    bytes: number[];
    charStarts: number[];
} {
    const bytes: number[] = [];
    const charStarts: number[] = [];
    for (const m of mapping) {
        charStarts.push(bytes.length);
        for (const b of m.bytes) bytes.push(b);
    }
    return { bytes, charStarts };
}
