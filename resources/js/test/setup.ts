import '@testing-library/jest-dom/vitest';
import { afterEach, expect, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';
import React from 'react';

// M12 chunk 1 — wire jest-axe's matcher onto Vitest's expect. The
// matcher is a plain {pass, message} shape so it works with any
// expect.extend-compatible runner. Page-level a11y tests live under
// resources/js/__tests__/a11y/ and use the helper at
// resources/js/test/axe.ts to invoke axe-core with our shared
// jsdom-safe rule config.
expect.extend(toHaveNoViolations);

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

// jsdom doesn't ship window.matchMedia; M8's useReducedMotion hook
// (and any future media-query-driven UI) needs it. A read-only stub
// is sufficient — tests that need to toggle reduced-motion mock the
// hook directly rather than the underlying media-query.
if (typeof window !== 'undefined' && !window.matchMedia) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    });
}

// Reset the DOM between tests to keep them isolated.
afterEach(() => {
    cleanup();
});
