import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

// Inertia's components/hooks require the createInertiaApp HeadManager
// + PageContext that only exist at runtime. In isolated component tests
// we stub the bits we use so renders don't crash.
vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...props }, children),
        usePage: () => ({
            props: {
                auth: { user: null },
                errors: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/',
            component: 'Welcome',
            version: null,
        }),
    };
});

// Ziggy injects a global `route()` function via the @routes blade directive.
// In jsdom tests there's no blade output, so stub it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).route = (name?: string) => `/_test/${name ?? 'route'}`;

// Reset the DOM between tests to keep them isolated.
afterEach(() => {
    cleanup();
});
