import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { formPatch, setDataMock } = vi.hoisted(() => ({
    formPatch: vi.fn(),
    setDataMock: vi.fn(),
}));

vi.mock('@inertiajs/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@inertiajs/react')>();
    return {
        ...actual,
        Head: () => null,
        Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
            React.createElement('a', { href, ...rest }, children),
        useForm: (initial: Record<string, unknown>) => {
            const data = { ...initial };
            return {
                data,
                errors: {} as Record<string, string>,
                processing: false,
                recentlySuccessful: false,
                setData: (key: string, value: unknown) => {
                    data[key] = value;
                    setDataMock(key, value);
                },
                patch: formPatch,
            };
        },
        usePage: () => ({
            props: {
                auth: { user: { id: 1, name: 'Alice', email: 'a@example.com', role: 'user' } },
                errors: {},
                flash: {},
                ziggy: { location: 'http://localhost' },
            },
            url: '/settings',
            component: 'Settings',
            version: null,
        }),
    };
});

import React from 'react';
import Settings from '@/Pages/Settings';

describe('<Settings />', () => {
    it('renders the privacy form', () => {
        render(<Settings storePrompts={true} />);
        expect(screen.getByTestId('settings-form')).toBeInTheDocument();
        expect(screen.getByTestId('store-prompts-checkbox')).toBeChecked();
    });

    it('renders with checkbox unchecked when storePrompts is false', () => {
        render(<Settings storePrompts={false} />);
        expect(screen.getByTestId('store-prompts-checkbox')).not.toBeChecked();
    });

    it('dispatches a PATCH on submit', () => {
        render(<Settings storePrompts={true} />);
        fireEvent.submit(screen.getByTestId('settings-form'));
        expect(formPatch).toHaveBeenCalled();
    });

    it('toggling the checkbox updates form data', () => {
        render(<Settings storePrompts={true} />);
        fireEvent.click(screen.getByTestId('store-prompts-checkbox'));
        expect(setDataMock).toHaveBeenCalledWith('store_prompts', false);
    });
});
