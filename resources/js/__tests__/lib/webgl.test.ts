import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetWebGL2Cache, isWebGL2Supported } from '@/lib/webgl';

afterEach(() => {
    _resetWebGL2Cache();
    vi.restoreAllMocks();
});

describe('isWebGL2Supported', () => {
    it('returns false in jsdom (no WebGL context available)', () => {
        expect(isWebGL2Supported()).toBe(false);
    });

    it('caches the result across calls (probes exactly once)', () => {
        const spy = vi
            .spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockReturnValue({} as unknown as RenderingContext);

        const first = isWebGL2Supported();
        const second = isWebGL2Supported();
        const third = isWebGL2Supported();

        expect(first).toBe(true);
        expect(second).toBe(true);
        expect(third).toBe(true);
        // Cache hit — three calls but only one underlying probe.
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('returns false when getContext returns null', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        expect(isWebGL2Supported()).toBe(false);
    });

    it('returns false when getContext throws (sandboxed env)', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
            throw new Error('sandboxed');
        });
        expect(isWebGL2Supported()).toBe(false);
    });
});
