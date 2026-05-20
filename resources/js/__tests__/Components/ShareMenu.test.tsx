import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routerPost, routerDelete } = vi.hoisted(() => ({
    routerPost: vi.fn(),
    routerDelete: vi.fn(),
}));

vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();

    return {
        ...actual,
        router: { post: routerPost, delete: routerDelete },
    };
});

import ShareMenu from '@/Components/ShareMenu';

beforeEach(() => {
    // jsdom doesn't ship navigator.clipboard by default; fake it.
    Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
});

afterEach(() => {
    routerPost.mockReset();
    routerDelete.mockReset();
});

describe('<ShareMenu /> — sharing OFF state', () => {
    it('renders the trigger button', () => {
        render(
            <ShareMenu
                threadId={1}
                shareToken={null}
                shareEnabledAt={null}
                origin="https://example.com"
            />,
        );
        expect(screen.getByTestId('share-menu-trigger')).toBeInTheDocument();
    });

    it('does NOT show the green ON indicator when sharing is off', () => {
        render(
            <ShareMenu
                threadId={1}
                shareToken={null}
                shareEnabledAt={null}
                origin="https://example.com"
            />,
        );
        expect(screen.queryByTestId('share-menu-on-indicator')).not.toBeInTheDocument();
    });

    it('clicking the trigger reveals an "Enable sharing" button', () => {
        render(
            <ShareMenu
                threadId={1}
                shareToken={null}
                shareEnabledAt={null}
                origin="https://example.com"
            />,
        );
        fireEvent.click(screen.getByTestId('share-menu-trigger'));
        expect(screen.getByTestId('share-menu-enable')).toBeInTheDocument();
        expect(screen.queryByTestId('share-menu-disable')).not.toBeInTheDocument();
        expect(screen.queryByTestId('share-menu-url')).not.toBeInTheDocument();
    });

    it('Enable button fires router.post to /threads/{id}/share', () => {
        render(
            <ShareMenu
                threadId={42}
                shareToken={null}
                shareEnabledAt={null}
                origin="https://example.com"
            />,
        );
        fireEvent.click(screen.getByTestId('share-menu-trigger'));
        fireEvent.click(screen.getByTestId('share-menu-enable'));
        expect(routerPost).toHaveBeenCalledWith(
            '/threads/42/share',
            {},
            expect.objectContaining({ preserveScroll: true }),
        );
    });
});

describe('<ShareMenu /> — sharing ON state', () => {
    const enabledProps = {
        threadId: 7,
        shareToken: 'abc123abc123abc123abc123abc123ab',
        shareEnabledAt: '2026-05-19T00:00:00Z',
        origin: 'https://example.com',
    };

    it('shows the green ON indicator on the trigger', () => {
        render(<ShareMenu {...enabledProps} />);
        expect(screen.getByTestId('share-menu-on-indicator')).toBeInTheDocument();
    });

    it('shows the URL input + Copy + Disable buttons', () => {
        render(<ShareMenu {...enabledProps} />);
        fireEvent.click(screen.getByTestId('share-menu-trigger'));

        const urlInput = screen.getByTestId('share-menu-url');
        expect((urlInput as HTMLInputElement).value).toBe(
            'https://example.com/share/abc123abc123abc123abc123abc123ab',
        );
        expect(screen.getByTestId('share-menu-copy')).toBeInTheDocument();
        expect(screen.getByTestId('share-menu-disable')).toBeInTheDocument();
        expect(screen.queryByTestId('share-menu-enable')).not.toBeInTheDocument();
    });

    it('Copy button calls navigator.clipboard.writeText with the URL', async () => {
        render(<ShareMenu {...enabledProps} />);
        fireEvent.click(screen.getByTestId('share-menu-trigger'));
        fireEvent.click(screen.getByTestId('share-menu-copy'));

        await waitFor(() => {
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                'https://example.com/share/abc123abc123abc123abc123abc123ab',
            );
        });
    });

    it('Disable button fires router.delete to /threads/{id}/share (single click, no confirm)', () => {
        render(<ShareMenu {...enabledProps} />);
        fireEvent.click(screen.getByTestId('share-menu-trigger'));
        fireEvent.click(screen.getByTestId('share-menu-disable'));
        expect(routerDelete).toHaveBeenCalledWith(
            '/threads/7/share',
            expect.objectContaining({ preserveScroll: true }),
        );
    });

    it('Copy button falls back to window.prompt when clipboard rejects', async () => {
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
        });
        const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => null);

        render(<ShareMenu {...enabledProps} />);
        fireEvent.click(screen.getByTestId('share-menu-trigger'));
        fireEvent.click(screen.getByTestId('share-menu-copy'));

        await waitFor(() => {
            expect(promptSpy).toHaveBeenCalledWith(
                'Copy the share URL:',
                'https://example.com/share/abc123abc123abc123abc123abc123ab',
            );
        });
        promptSpy.mockRestore();
    });
});
