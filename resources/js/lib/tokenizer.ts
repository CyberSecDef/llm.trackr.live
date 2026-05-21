/*
 * tokenizer (M13 chunk 3a) — lazy-loaded BPE tokenizer wrapper
 * for Scene 3 (BPE tokenization) of the cinematic visualization.
 *
 * Per the chunk-3 pre-discussion + decisions block: `js-tiktoken`
 * is the pick (pure JS, no Wasm dep, works in every browser the
 * M12 chunk-9 cross-browser smoke covers). We lazy-load it so the
 * main bundle doesn't pull the BPE vocab on every page; the cost
 * is paid once on first viz-mount.
 *
 * Encoding: `cl100k_base` — the GPT-3.5 / GPT-4 vocabulary.
 * Reasonable approximation of what most modern API tokenizers
 * produce; close enough for an educational animation.
 *
 * If `js-tiktoken` import fails (e.g., bundle stripped, network
 * blip on a CDN-served chunk), the caller gets a fallback
 * tokenizer that returns each codepoint as its own "token" — the
 * BPE animation degrades to a chars-already-are-tokens display
 * which is wrong-but-not-broken.
 */

export interface BpeToken {
    /** Token ID (integer). Drives the TokenPill hue + vocab lookup. */
    id: number;
    /** The substring this token represents. */
    string: string;
    /** Span in the original byte array — [start, end). */
    byteRange: [number, number];
}

export interface Tokenizer {
    /** Tokenize a string into BPE tokens. */
    encode(text: string): BpeToken[];
    /** Decode a token ID back to its string. Used by Scene 20. */
    decode(tokenId: number): string;
}

let cachedTokenizer: Tokenizer | null = null;
let inflight: Promise<Tokenizer> | null = null;

/** Lazy-load the BPE tokenizer. Cached after first successful load. */
export async function loadTokenizer(): Promise<Tokenizer> {
    if (cachedTokenizer) return cachedTokenizer;
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const mod = await import('js-tiktoken');
            // js-tiktoken exports `getEncoding(name)` to load a built-in.
            const enc = mod.getEncoding('cl100k_base');

            const tokenizer: Tokenizer = {
                encode(text: string): BpeToken[] {
                    const ids = enc.encode(text);
                    const result: BpeToken[] = [];
                    let cursor = 0;
                    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
                    for (const id of ids) {
                        const str = enc.decode([id]);
                        const byteLen = encoder ? encoder.encode(str).length : str.length;
                        result.push({
                            id,
                            string: str,
                            byteRange: [cursor, cursor + byteLen],
                        });
                        cursor += byteLen;
                    }
                    return result;
                },
                decode(tokenId: number): string {
                    return enc.decode([tokenId]);
                },
            };

            cachedTokenizer = tokenizer;
            return tokenizer;
        } catch {
            // Fallback: each codepoint is its own "token." Wrong but
            // non-broken — Scene 3 animates a char-per-pill BPE pass
            // instead of real subword merges.
            const fallback: Tokenizer = {
                encode(text: string): BpeToken[] {
                    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
                    let cursor = 0;
                    const tokens: BpeToken[] = [];
                    let id = 0;
                    for (const ch of Array.from(text)) {
                        const byteLen = encoder ? encoder.encode(ch).length : ch.length;
                        tokens.push({
                            id: id++,
                            string: ch,
                            byteRange: [cursor, cursor + byteLen],
                        });
                        cursor += byteLen;
                    }
                    return tokens;
                },
                decode(tokenId: number): string {
                    // We can't reverse the codepoint stream without
                    // tracking it; return the ID as a string.
                    return String(tokenId);
                },
            };
            cachedTokenizer = fallback;
            return fallback;
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

/**
 * Reset the cache. Test-only.
 */
export function _resetTokenizerCache(): void {
    cachedTokenizer = null;
    inflight = null;
}
