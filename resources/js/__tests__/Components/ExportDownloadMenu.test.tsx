import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeChannel {
    listeners: Record<string, ((p: unknown) => void)[]> = {};
    listen(event: string, cb: (p: unknown) => void) {
        (this.listeners[event] ??= []).push(cb);

        return this;
    }
    fire(event: string, payload: unknown) {
        for (const cb of this.listeners[event] ?? []) cb(payload);
    }
}

class FakeEcho {
    channels: Record<string, FakeChannel> = {};
    private(name: string) {
        return (this.channels[name] ??= new FakeChannel());
    }
    leave(_name: string) {}
}

let echo: FakeEcho;

beforeEach(() => {
    echo = new FakeEcho();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Echo = echo;
    document.head.innerHTML = '<meta name="csrf-token" content="t">';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn();
});

afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Echo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
});

import ExportDownloadMenu from '@/Components/ExportDownloadMenu';

describe('<ExportDownloadMenu />', () => {
    it('renders a Download trigger button', () => {
        render(<ExportDownloadMenu runId={42} jsonHref="/runs/42/export.json" />);
        expect(screen.getByTestId('export-menu-trigger')).toBeInTheDocument();
    });

    it('opens the menu on click with all three items', () => {
        render(<ExportDownloadMenu runId={42} jsonHref="/runs/42/export.json" />);
        fireEvent.click(screen.getByTestId('export-menu-trigger'));

        expect(screen.getByTestId('export-menu-json')).toBeInTheDocument();
        expect(screen.getByTestId('export-menu-gif')).toBeInTheDocument();
        expect(screen.getByTestId('export-menu-mp4')).toBeInTheDocument();
    });

    it('JSON menu item is a direct anchor with download attribute', () => {
        render(<ExportDownloadMenu runId={42} jsonHref="/runs/42/export.json" />);
        fireEvent.click(screen.getByTestId('export-menu-trigger'));

        const json = screen.getByTestId('export-menu-json');
        expect(json.tagName).toBe('A');
        expect(json.getAttribute('href')).toBe('/runs/42/export.json');
        expect(json.getAttribute('download')).not.toBeNull();
    });

    it('GIF/MP4 are buttons (not anchors) before trigger fires', () => {
        render(<ExportDownloadMenu runId={42} jsonHref="/runs/42/export.json" />);
        fireEvent.click(screen.getByTestId('export-menu-trigger'));

        expect(screen.getByTestId('export-menu-gif').tagName).toBe('BUTTON');
        expect(screen.getByTestId('export-menu-mp4').tagName).toBe('BUTTON');
    });

    it('clicking GIF on a cache hit flips both rows to anchors', async () => {
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

        render(<ExportDownloadMenu runId={42} jsonHref="/runs/42/export.json" />);
        fireEvent.click(screen.getByTestId('export-menu-trigger'));
        fireEvent.click(screen.getByTestId('export-menu-gif'));

        await waitFor(() => {
            const gif = screen.getByTestId('export-menu-gif');
            expect(gif.tagName).toBe('A');
            expect(gif.getAttribute('href')).toBe('/runs/42/exports/gif');
        });
        // MP4 also flipped because the trigger returns both URLs.
        const mp4 = screen.getByTestId('export-menu-mp4');
        expect(mp4.tagName).toBe('A');
        expect(mp4.getAttribute('href')).toBe('/runs/42/exports/mp4');
    });

    it('shows rendering state with spinner on cache miss', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 202,
            json: () => Promise.resolve({ ready: false, status: 'queued' }),
        });

        render(<ExportDownloadMenu runId={77} jsonHref="/runs/77/export.json" />);
        fireEvent.click(screen.getByTestId('export-menu-trigger'));
        fireEvent.click(screen.getByTestId('export-menu-gif'));

        await waitFor(() => {
            expect(screen.getByTestId('export-menu-gif').textContent).toContain('rendering');
        });

        // The hook subscribes to the channel. Fire the broadcast.
        echo.channels['runs.77'].fire('.export.completed', {
            run_id: 77,
            gif_url: '/runs/77/exports/gif',
            mp4_url: '/runs/77/exports/mp4',
            frames_count: 1,
            duration_ms: 1,
        });

        await waitFor(() => {
            expect(screen.getByTestId('export-menu-gif').tagName).toBe('A');
        });
    });

    it('M10 chunk 6: shows (2D fallback) badge when fallback_engaged is true on a cache hit', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    ready: true,
                    gif_url: '/runs/42/exports/gif',
                    mp4_url: '/runs/42/exports/mp4',
                    fallback_engaged: true,
                }),
        });

        render(<ExportDownloadMenu runId={42} jsonHref="/runs/42/export.json" />);
        fireEvent.click(screen.getByTestId('export-menu-trigger'));
        fireEvent.click(screen.getByTestId('export-menu-gif'));

        await waitFor(() => {
            expect(screen.getByTestId('export-menu-gif-fallback')).toBeInTheDocument();
            expect(screen.getByTestId('export-menu-mp4-fallback')).toBeInTheDocument();
        });
        // Both badges read "(2D fallback)".
        expect(screen.getByTestId('export-menu-gif-fallback').textContent).toContain('2D fallback');
    });

    it('M10 chunk 6: no fallback badge when fallback_engaged is false', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    ready: true,
                    gif_url: '/g',
                    mp4_url: '/m',
                    fallback_engaged: false,
                }),
        });

        render(<ExportDownloadMenu runId={42} jsonHref="/runs/42/export.json" />);
        fireEvent.click(screen.getByTestId('export-menu-trigger'));
        fireEvent.click(screen.getByTestId('export-menu-gif'));

        await waitFor(() => {
            expect(screen.getByTestId('export-menu-gif').tagName).toBe('A');
        });
        expect(screen.queryByTestId('export-menu-gif-fallback')).not.toBeInTheDocument();
    });

    it('shows error chip when broadcast says export.failed', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 202,
            json: () => Promise.resolve({ ready: false }),
        });

        render(<ExportDownloadMenu runId={99} jsonHref="/runs/99/export.json" />);
        fireEvent.click(screen.getByTestId('export-menu-trigger'));
        fireEvent.click(screen.getByTestId('export-menu-gif'));

        await waitFor(() => {
            expect(screen.getByTestId('export-menu-gif').textContent).toContain('rendering');
        });

        echo.channels['runs.99'].fire('.export.failed', {
            run_id: 99,
            message: 'Chromium binary not found',
        });

        await waitFor(() => {
            const err = screen.getByTestId('export-menu-error');
            expect(err.textContent).toContain('Chromium binary not found');
        });
    });
});
