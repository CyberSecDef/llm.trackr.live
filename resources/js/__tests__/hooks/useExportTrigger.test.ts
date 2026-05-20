import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExportTrigger } from '@/hooks/useExportTrigger';

/**
 * Fake Echo channel that lets tests trigger the .export.completed
 * / .export.failed listeners on demand.
 */
class FakeChannel {
    listeners: Record<string, ((payload: unknown) => void)[]> = {};

    listen(event: string, cb: (payload: unknown) => void) {
        (this.listeners[event] ??= []).push(cb);

        return this;
    }

    fire(event: string, payload: unknown) {
        for (const cb of this.listeners[event] ?? []) cb(payload);
    }
}

class FakeEcho {
    channels: Record<string, FakeChannel> = {};
    leftChannels: string[] = [];

    private(name: string) {
        return (this.channels[name] ??= new FakeChannel());
    }

    leave(name: string) {
        this.leftChannels.push(name);
    }
}

let echo: FakeEcho;

beforeEach(() => {
    echo = new FakeEcho();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Echo = echo;

    // Provide a CSRF meta so the hook doesn't crash on
    // document.querySelector(...).
    document.head.innerHTML = '<meta name="csrf-token" content="test-token">';

    // Default fetch fake — overridden per test below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn();
});

afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Echo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
});

describe('useExportTrigger', () => {
    it('starts idle with no URLs / no error', () => {
        const { result } = renderHook(() => useExportTrigger(42));
        expect(result.current.state).toBe('idle');
        expect(result.current.gifUrl).toBeNull();
        expect(result.current.mp4Url).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('cache hit: trigger() flips to ready immediately with URLs', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    ready: true,
                    gif_url: '/runs/42/exports/gif',
                    mp4_url: '/runs/42/exports/mp4',
                }),
        });

        const { result } = renderHook(() => useExportTrigger(42));
        await act(async () => {
            await result.current.trigger();
        });

        expect(result.current.state).toBe('ready');
        expect(result.current.gifUrl).toBe('/runs/42/exports/gif');
        expect(result.current.mp4Url).toBe('/runs/42/exports/mp4');
    });

    it('cache miss: trigger() flips to rendering, then ready on export.completed', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: false, // 202 is not "ok" but acceptable to the hook
            status: 202,
            json: () => Promise.resolve({ ready: false, status: 'queued' }),
        });

        const { result } = renderHook(() => useExportTrigger(77));
        await act(async () => {
            await result.current.trigger();
        });

        expect(result.current.state).toBe('rendering');

        // Now fire the broadcast.
        await act(async () => {
            echo.channels['runs.77'].fire('.export.completed', {
                run_id: 77,
                gif_url: '/runs/77/exports/gif',
                mp4_url: '/runs/77/exports/mp4',
                frames_count: 90,
                duration_ms: 3000,
            });
        });

        expect(result.current.state).toBe('ready');
        expect(result.current.gifUrl).toBe('/runs/77/exports/gif');
        // Hook leaves the channel after ready.
        expect(echo.leftChannels).toContain('runs.77');
    });

    it('cache miss: flips to error on export.failed broadcast', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 202,
            json: () => Promise.resolve({ ready: false, status: 'queued' }),
        });

        const { result } = renderHook(() => useExportTrigger(99));
        await act(async () => {
            await result.current.trigger();
        });

        await act(async () => {
            echo.channels['runs.99'].fire('.export.failed', {
                run_id: 99,
                message: 'ffmpeg crashed',
            });
        });

        expect(result.current.state).toBe('error');
        expect(result.current.error).toBe('ffmpeg crashed');
    });

    it('flips to error when the POST fetch throws', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('network out'));

        const { result } = renderHook(() => useExportTrigger(42));
        await act(async () => {
            await result.current.trigger();
        });

        expect(result.current.state).toBe('error');
        expect(result.current.error).toContain('network');
    });

    it('flips to error on non-2xx HTTP responses', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            json: () => Promise.resolve({}),
        });

        const { result } = renderHook(() => useExportTrigger(42));
        await act(async () => {
            await result.current.trigger();
        });

        expect(result.current.state).toBe('error');
        expect(result.current.error).toContain('403');
    });

    it('reset() returns to idle + leaves the Echo channel', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 202,
            json: () => Promise.resolve({ ready: false }),
        });

        const { result } = renderHook(() => useExportTrigger(7));
        await act(async () => {
            await result.current.trigger();
        });
        expect(result.current.state).toBe('rendering');

        act(() => result.current.reset());
        expect(result.current.state).toBe('idle');
        expect(echo.leftChannels).toContain('runs.7');
    });

    it('ignores events for other run_ids on the same channel', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 202,
            json: () => Promise.resolve({ ready: false }),
        });

        const { result } = renderHook(() => useExportTrigger(50));
        await act(async () => {
            await result.current.trigger();
        });

        // Wrong run_id — must not flip state.
        await act(async () => {
            echo.channels['runs.50'].fire('.export.completed', {
                run_id: 99,
                gif_url: '/x',
                mp4_url: '/y',
                frames_count: 1,
                duration_ms: 1,
            });
        });

        expect(result.current.state).toBe('rendering');
    });

    it('returns null URLs + skips the subscribe path when Echo is unavailable', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).Echo;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 202,
            json: () => Promise.resolve({ ready: false }),
        });

        const { result } = renderHook(() => useExportTrigger(42));
        await act(async () => {
            await result.current.trigger();
        });
        // No echo → hook stays in 'rendering'; the user can refresh.
        expect(result.current.state).toBe('rendering');
    });
});
