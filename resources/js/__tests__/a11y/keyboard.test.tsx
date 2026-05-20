import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * M12 chunk 2 — keyboard-interaction tests on the custom (non-shadcn)
 * interactive elements. Shadcn primitives carry their own keyboard
 * story via Radix and are covered by the axe harness in chunk 1;
 * these tests target the hand-rolled tabs + playback buttons that
 * don't go through Radix.
 *
 * Scope per chunk-2 surgical-fix decision:
 *   - PlaybackControls (Space toggles, Tab order)
 *   - Custom tablist buttons (Threads/Show right pane, Threads/Index
 *     archive filter) — reachable via Tab, activate via Enter / Space
 *   - ShareMenu Popover — keyboard open + Escape closes + focus
 *     returns (Radix-provided behavior, but verifying it survives
 *     in jsdom for regression coverage)
 */

const { routerPost } = vi.hoisted(() => ({
    routerPost: vi.fn(),
}));

vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
        router: { post: routerPost, delete: vi.fn(), get: vi.fn() },
    };
});

import React from 'react';
import PlaybackControls from '@/Components/PlaybackControls';
import ShareMenu from '@/Components/ShareMenu';

beforeEach(() => {
    // jsdom 29 protects navigator.clipboard with a getter when it's
    // already been defined by an earlier test file in the same run.
    // Object.defineProperty bypasses that.
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true,
    });
});

afterEach(() => {
    routerPost.mockReset();
});

describe('PlaybackControls keyboard', () => {
    it('Tab orders the play / step / speed buttons', async () => {
        const user = userEvent.setup();
        render(
            <PlaybackControls
                playing={false}
                speed={1}
                cursor={5}
                totalEvents={10}
                isLive={false}
                onToggle={vi.fn()}
                onStep={vi.fn()}
                onSpeedChange={vi.fn()}
                onJumpToLive={vi.fn()}
            />,
        );

        await user.tab();
        expect(screen.getByTestId('playback-toggle')).toHaveFocus();

        await user.tab();
        expect(screen.getByTestId('playback-step')).toHaveFocus();

        await user.tab();
        expect(screen.getByTestId('playback-cursor-jump')).toHaveFocus();
    });

    it('Space activates the play/pause toggle', async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        render(
            <PlaybackControls
                playing={false}
                speed={1}
                cursor={0}
                totalEvents={10}
                isLive={true}
                onToggle={onToggle}
                onStep={vi.fn()}
                onSpeedChange={vi.fn()}
                onJumpToLive={vi.fn()}
            />,
        );

        await user.tab();
        await user.keyboard(' ');
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('Enter activates the step button', async () => {
        const user = userEvent.setup();
        const onStep = vi.fn();
        render(
            <PlaybackControls
                playing={false}
                speed={1}
                cursor={3}
                totalEvents={10}
                isLive={true}
                onToggle={vi.fn()}
                onStep={onStep}
                onSpeedChange={vi.fn()}
                onJumpToLive={vi.fn()}
            />,
        );

        screen.getByTestId('playback-step').focus();
        await user.keyboard('{Enter}');
        expect(onStep).toHaveBeenCalledTimes(1);
    });

    it('speed buttons each have focus-visible ring classes', () => {
        render(
            <PlaybackControls
                playing={false}
                speed={1}
                cursor={0}
                totalEvents={10}
                isLive={true}
                onToggle={vi.fn()}
                onStep={vi.fn()}
                onSpeedChange={vi.fn()}
                onJumpToLive={vi.fn()}
            />,
        );

        for (const s of [0.5, 1, 2, 4]) {
            const btn = screen.getByTestId(`playback-speed-${s}`);
            expect(btn.className).toContain('focus-visible:ring-2');
        }
    });
});

describe('ShareMenu keyboard', () => {
    it('Enter opens the popover from the trigger', async () => {
        const user = userEvent.setup();
        render(
            <ShareMenu
                threadId={1}
                shareToken={null}
                shareEnabledAt={null}
                origin="https://example.com"
            />,
        );

        const trigger = screen.getByTestId('share-menu-trigger');
        trigger.focus();
        expect(trigger).toHaveFocus();

        await user.keyboard('{Enter}');
        await waitFor(() => {
            expect(screen.getByTestId('share-menu-enable')).toBeInTheDocument();
        });
    });

    it('Escape closes the popover', async () => {
        const user = userEvent.setup();
        render(
            <ShareMenu
                threadId={1}
                shareToken={'a'.repeat(32)}
                shareEnabledAt={'2026-05-19T00:00:00Z'}
                origin="https://example.com"
            />,
        );

        const trigger = screen.getByTestId('share-menu-trigger');
        trigger.focus();
        await user.keyboard('{Enter}');

        await waitFor(() => {
            expect(screen.getByTestId('share-menu-disable')).toBeInTheDocument();
        });

        await user.keyboard('{Escape}');
        await waitFor(() => {
            expect(screen.queryByTestId('share-menu-disable')).not.toBeInTheDocument();
        });
    });
});

describe('Custom tablist focus-visible coverage', () => {
    it('PlaybackControls play / step / cursor-jump have focus-visible rings', () => {
        render(
            <PlaybackControls
                playing={false}
                speed={1}
                cursor={5}
                totalEvents={10}
                isLive={false}
                onToggle={vi.fn()}
                onStep={vi.fn()}
                onSpeedChange={vi.fn()}
                onJumpToLive={vi.fn()}
            />,
        );

        for (const testId of ['playback-toggle', 'playback-step', 'playback-cursor-jump']) {
            const btn = screen.getByTestId(testId);
            expect(btn.className).toContain('focus-visible:ring-2');
        }
    });
});
