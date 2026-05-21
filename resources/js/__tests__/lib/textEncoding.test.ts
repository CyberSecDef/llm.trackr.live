import { describe, expect, it } from 'vitest';
import { charsToBytes, flattenBytes } from '@/lib/textEncoding';

describe('charsToBytes', () => {
    it('returns one entry per code point with UTF-8 bytes', () => {
        const r = charsToBytes('hi');
        expect(r).toHaveLength(2);
        expect(r[0]).toEqual({ char: 'h', bytes: [104] });
        expect(r[1]).toEqual({ char: 'i', bytes: [105] });
    });

    it('splits emoji into 4 UTF-8 bytes (teaching beat)', () => {
        const r = charsToBytes('😀');
        expect(r).toHaveLength(1);
        expect(r[0].char).toBe('😀');
        // U+1F600 = 0xF0 0x9F 0x98 0x80
        expect(r[0].bytes).toEqual([0xf0, 0x9f, 0x98, 0x80]);
    });

    it('splits non-Latin chars into multi-byte sequences', () => {
        const r = charsToBytes('é');
        // U+00E9 = 0xC3 0xA9
        expect(r[0].bytes).toEqual([0xc3, 0xa9]);

        const cjk = charsToBytes('日');
        // U+65E5 = 0xE6 0x97 0xA5
        expect(cjk[0].bytes).toEqual([0xe6, 0x97, 0xa5]);
    });

    it('handles an empty string', () => {
        expect(charsToBytes('')).toEqual([]);
    });
});

describe('flattenBytes', () => {
    it('flattens to a single byte stream + per-char start indices', () => {
        const r = charsToBytes('hé');
        const { bytes, charStarts } = flattenBytes(r);
        expect(bytes).toEqual([104, 0xc3, 0xa9]);
        expect(charStarts).toEqual([0, 1]);
    });
});
