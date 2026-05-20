import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToastSuccess, mockToastInfo, pageState } = vi.hoisted(() => ({
    mockToastSuccess: vi.fn(),
    mockToastInfo: vi.fn(),
    pageState: {
        value: {
            props: {
                auth: { user: null },
                errors: {},
                ziggy: { location: 'http://localhost' },
                flash: undefined as { status?: string } | undefined,
            },
            url: '/',
            component: 'Welcome',
            version: null,
        },
    },
}));

vi.mock('@inertiajs/react', () => ({
    usePage: () => pageState.value,
}));

vi.mock('@/Components/ui/sonner', () => ({
    toast: { success: mockToastSuccess, info: mockToastInfo, error: vi.fn() },
}));

import React from 'react';
import { useFlashToast } from '@/hooks/useFlashToast';

function Probe() {
    useFlashToast();
    return React.createElement('div', null, 'probe');
}

beforeEach(() => {
    pageState.value = {
        ...pageState.value,
        props: { ...pageState.value.props, flash: undefined },
    };
});

afterEach(() => {
    mockToastSuccess.mockReset();
    mockToastInfo.mockReset();
});

describe('useFlashToast', () => {
    it('fires success toast for api-key-added', () => {
        pageState.value = {
            ...pageState.value,
            props: { ...pageState.value.props, flash: { status: 'api-key-added' } },
        };
        render(<Probe />);
        expect(mockToastSuccess).toHaveBeenCalledWith('API key added.');
    });

    it('fires info toast for api-key-deleted:{vendor}', () => {
        pageState.value = {
            ...pageState.value,
            props: { ...pageState.value.props, flash: { status: 'api-key-deleted:openai' } },
        };
        render(<Probe />);
        expect(mockToastInfo).toHaveBeenCalledWith('Deleted openai key.');
    });

    it('fires success toast for settings-saved', () => {
        pageState.value = {
            ...pageState.value,
            props: { ...pageState.value.props, flash: { status: 'settings-saved' } },
        };
        render(<Probe />);
        expect(mockToastSuccess).toHaveBeenCalledWith('Settings saved.');
    });

    it('fires success toast for refresh-complete:{msg}', () => {
        pageState.value = {
            ...pageState.value,
            props: {
                ...pageState.value.props,
                flash: { status: 'refresh-complete:added 12 models' },
            },
        };
        render(<Probe />);
        expect(mockToastSuccess).toHaveBeenCalledWith('Registry refreshed — added 12 models');
    });

    it('is a no-op when there is no flash status', () => {
        render(<Probe />);
        expect(mockToastSuccess).not.toHaveBeenCalled();
        expect(mockToastInfo).not.toHaveBeenCalled();
    });

    it('ignores unknown flash statuses (graceful degradation)', () => {
        pageState.value = {
            ...pageState.value,
            props: { ...pageState.value.props, flash: { status: 'some-future-status' } },
        };
        render(<Probe />);
        expect(mockToastSuccess).not.toHaveBeenCalled();
        expect(mockToastInfo).not.toHaveBeenCalled();
    });
});
