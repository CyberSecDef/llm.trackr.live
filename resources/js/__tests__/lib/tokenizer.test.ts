import { afterEach, describe, expect, it } from 'vitest';
import { _resetTokenizerCache, loadTokenizer } from '@/lib/tokenizer';

afterEach(() => {
    _resetTokenizerCache();
});

describe('loadTokenizer', () => {
    it('returns a tokenizer that encodes a known string into BpeTokens', async () => {
        const tok = await loadTokenizer();
        const tokens = tok.encode('hello world');
        expect(tokens.length).toBeGreaterThan(0);
        // First token should be a string substring of the input.
        for (const t of tokens) {
            expect(typeof t.id).toBe('number');
            expect(typeof t.string).toBe('string');
            expect(t.byteRange[0]).toBeGreaterThanOrEqual(0);
            expect(t.byteRange[1]).toBeGreaterThan(t.byteRange[0]);
        }
    });

    it('caches the tokenizer across calls', async () => {
        const a = await loadTokenizer();
        const b = await loadTokenizer();
        expect(a).toBe(b);
    });

    it('decode(id) returns the same string the token carries', async () => {
        const tok = await loadTokenizer();
        const tokens = tok.encode('test');
        for (const t of tokens) {
            expect(tok.decode(t.id)).toBe(t.string);
        }
    });

    it('produces non-empty token IDs (real cl100k_base, not the fallback)', async () => {
        const tok = await loadTokenizer();
        const tokens = tok.encode('hello world');
        // cl100k_base IDs run into the tens of thousands.
        const hasLargeId = tokens.some((t) => t.id > 100);
        expect(hasLargeId).toBe(true);
    });
});
