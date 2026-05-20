import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/*
 * M12 chunk 3 — verifies prefers-reduced-motion gating on the
 * `animate-pulse` / `animate-spin` classes. jsdom doesn't honor the
 * `prefers-reduced-motion` media query, so we can't run a real
 * "is the element actually still" check; instead we assert that
 * each animated element ships the `motion-safe:` prefix that
 * Tailwind compiles into the `@media (prefers-reduced-motion: no-preference)`
 * scope. In a real browser with reduced-motion ON, those animations
 * never run; with reduced-motion OFF they do.
 *
 * If a future contributor pastes plain `animate-pulse` /
 * `animate-spin` back in, these tests fail and CI blocks the
 * regression.
 */

const { mockUseExportTrigger } = vi.hoisted(() => ({
    mockUseExportTrigger: vi.fn(),
}));

vi.mock('@/hooks/useExportTrigger', () => ({
    useExportTrigger: mockUseExportTrigger,
}));

import PlaybackControls from '@/Components/PlaybackControls';
import ExportDownloadMenu from '@/Components/ExportDownloadMenu';

describe('motion-reduce gating', () => {
    it('PlaybackControls LIVE pill Radio uses motion-safe:animate-pulse', () => {
        render(
            <PlaybackControls
                playing={false}
                speed={1}
                cursor={5}
                totalEvents={10}
                isLive={true}
                onToggle={vi.fn()}
                onStep={vi.fn()}
                onSpeedChange={vi.fn()}
                onJumpToLive={vi.fn()}
            />,
        );
        const pill = screen.getByTestId('playback-live-pill');
        const radio = pill.querySelector('svg');
        expect(radio).not.toBeNull();
        const cls = radio!.getAttribute('class') || '';
        expect(cls).toContain('motion-safe:animate-pulse');
        // And NOT the bare `animate-pulse` class which would run
        // even with prefers-reduced-motion set.
        expect(/(^|\s)animate-pulse(\s|$)/.test(cls)).toBe(false);
    });

    it('ExportDownloadMenu Loader2 spinner uses motion-safe:animate-spin while rendering', () => {
        mockUseExportTrigger.mockReturnValue({
            state: 'rendering',
            gifUrl: null,
            mp4Url: null,
            error: null,
            fallbackEngaged: false,
            trigger: vi.fn(),
        });

        render(<ExportDownloadMenu runId={42} jsonHref="/runs/42/export.json" />);
        // Open the menu so the rendering Loader is mounted (Radix
        // renders PopoverContent into a portal outside `container`).
        fireEvent.click(screen.getByTestId('export-menu-trigger'));

        // The Loader2 lives inside the GIF + MP4 menu items; query
        // them from the full document since they live in a portal.
        const gifItem = screen.getByTestId('export-menu-gif');
        const mp4Item = screen.getByTestId('export-menu-mp4');
        for (const item of [gifItem, mp4Item]) {
            const loader = item.querySelector('svg');
            expect(loader).not.toBeNull();
            const cls = loader!.getAttribute('class') || '';
            expect(cls).toContain('motion-safe:animate-spin');
            // No bare animate-spin.
            expect(/(^|\s)animate-spin(\s|$)/.test(cls)).toBe(false);
        }
    });
});
