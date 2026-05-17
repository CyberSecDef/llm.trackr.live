import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Inertia's <Head> uses the HeadManager context that createInertiaApp sets up.
// In isolated component tests there's no app, so we stub Head to a no-op.
vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
    };
});

// Reset the DOM between tests to keep them isolated.
afterEach(() => {
    cleanup();
});
