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

// jsdom doesn't ship ResizeObserver; cmdk (used by the Command primitive
// from M7 chunk 7) needs it to measure its list at render time. A no-op
// stub is enough — we don't actually need resize callbacks to fire in
// jsdom-rendered tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver ??
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };

// jsdom also lacks Element.prototype.scrollIntoView; cmdk calls it when
// it scrolls the highlighted item into view. Stub before any test mounts.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {};
}

// Reset the DOM between tests to keep them isolated.
afterEach(() => {
    cleanup();
});
