import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above top-level consts; vi.hoisted lets the mock
// factory capture our spies by lifting them too.
const { routerGet, formPost } = vi.hoisted(() => ({
    routerGet: vi.fn(),
    formPost: vi.fn(),
}));

vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
        useForm: () => ({ post: formPost, processing: false }),
        router: { get: routerGet },
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Alice', email: 'a@example.com', role: 'user' } },
                errors: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/threads',
            component: 'Threads/Index',
            version: null,
        }),
    };
});

import React from 'react';
import ThreadsIndex from '@/Pages/Threads/Index';

const baseFilters = { q: '', archived: 'false', tag: '' } as const;
const baseProps = {
    threads: { data: [], current_page: 1, last_page: 1, total: 0, per_page: 20 },
    filters: { ...baseFilters },
    available_tags: [],
};

describe('<ThreadsIndex />', () => {
    afterEach(() => {
        routerGet.mockReset();
        formPost.mockReset();
        vi.useRealTimers();
    });

    it('renders the no-threads empty state when the user has none and no filters are active', () => {
        render(<ThreadsIndex {...baseProps} />);
        expect(screen.getByTestId('empty-all')).toBeInTheDocument();
        expect(screen.queryByTestId('empty-filtered')).not.toBeInTheDocument();
    });

    it('renders the filtered empty state when filters are active but no matches', () => {
        render(<ThreadsIndex {...baseProps} filters={{ ...baseFilters, q: 'nothing' }} />);
        expect(screen.getByTestId('empty-filtered')).toBeInTheDocument();
        expect(screen.queryByTestId('empty-all')).not.toBeInTheDocument();
    });

    it('renders thread cards when data is present', () => {
        render(
            <ThreadsIndex
                {...baseProps}
                threads={{
                    data: [
                        {
                            id: 1,
                            title: 'Quantum entanglement',
                            last_activity_at: new Date(Date.now() - 10 * 60_000).toISOString(),
                            run_count: 4,
                            archived: false,
                            tags: ['research'],
                        },
                        {
                            id: 2,
                            title: null,
                            last_activity_at: null,
                            run_count: 1,
                            archived: true,
                            tags: [],
                        },
                    ],
                    current_page: 1,
                    last_page: 1,
                    total: 2,
                    per_page: 20,
                }}
            />,
        );
        const list = screen.getByTestId('threads-list');
        expect(within(list).getByText('Quantum entanglement')).toBeInTheDocument();
        expect(within(list).getByText('Untitled thread')).toBeInTheDocument();
        expect(within(list).getByText('research')).toBeInTheDocument();
        expect(within(list).getByText(/archived/)).toBeInTheDocument();
    });

    it('links each thread card to its detail page', () => {
        render(
            <ThreadsIndex
                {...baseProps}
                threads={{
                    data: [
                        {
                            id: 42,
                            title: 'Test',
                            last_activity_at: null,
                            run_count: 0,
                            archived: false,
                            tags: [],
                        },
                    ],
                    current_page: 1,
                    last_page: 1,
                    total: 1,
                    per_page: 20,
                }}
            />,
        );
        expect(screen.getByRole('link', { name: /test/i })).toHaveAttribute('href', '/threads/42');
    });

    it('debounces the search input and visits /threads with the q param', async () => {
        vi.useFakeTimers();
        render(<ThreadsIndex {...baseProps} />);

        const input = screen.getByTestId('search-input');
        fireEvent.change(input, { target: { value: 'quantum' } });
        // Before the debounce fires.
        expect(routerGet).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(310);
        expect(routerGet).toHaveBeenCalledWith(
            '/threads',
            expect.objectContaining({ q: 'quantum' }),
            expect.objectContaining({ preserveScroll: true, replace: true }),
        );
    });

    it('reflects active archive filter on the toggle', () => {
        render(<ThreadsIndex {...baseProps} filters={{ ...baseFilters, archived: 'true' }} />);
        const toggle = screen.getByTestId('archive-toggle');
        const archivedBtn = within(toggle).getByRole('tab', { name: 'Archived' });
        expect(archivedBtn).toHaveAttribute('aria-selected', 'true');
    });

    it('issues a router.get when the archive toggle is clicked', () => {
        render(<ThreadsIndex {...baseProps} />);
        const toggle = screen.getByTestId('archive-toggle');
        fireEvent.click(within(toggle).getByRole('tab', { name: 'Archived' }));
        expect(routerGet).toHaveBeenCalledWith(
            '/threads',
            expect.objectContaining({ archived: 'true' }),
            expect.any(Object),
        );
    });

    it('renders the tag filter only when available_tags is non-empty', () => {
        const { rerender } = render(<ThreadsIndex {...baseProps} />);
        expect(screen.queryByTestId('tag-filter')).not.toBeInTheDocument();

        rerender(<ThreadsIndex {...baseProps} available_tags={['research', 'priority']} />);
        const select = screen.getByTestId('tag-filter');
        expect(select).toBeInTheDocument();
        expect(within(select).getByText('research')).toBeInTheDocument();
    });

    it('shows a "Clear" button when any filter is active', () => {
        const { rerender } = render(<ThreadsIndex {...baseProps} />);
        expect(screen.queryByTestId('clear-filters')).not.toBeInTheDocument();

        rerender(<ThreadsIndex {...baseProps} filters={{ ...baseFilters, q: 'foo' }} />);
        expect(screen.getByTestId('clear-filters')).toBeInTheDocument();
    });

    it('posts to /threads on "New thread" click', () => {
        render(<ThreadsIndex {...baseProps} />);
        fireEvent.click(screen.getByTestId('create-thread'));
        expect(formPost).toHaveBeenCalledWith('/threads');
    });

    it('renders pagination only when last_page > 1', () => {
        const { rerender } = render(<ThreadsIndex {...baseProps} />);
        expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();

        rerender(
            <ThreadsIndex
                {...baseProps}
                threads={{ ...baseProps.threads, current_page: 1, last_page: 3, total: 50 }}
            />,
        );
        expect(screen.getByTestId('pagination')).toBeInTheDocument();
        expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    });
});
