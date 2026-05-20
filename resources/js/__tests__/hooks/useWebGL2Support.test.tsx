import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// setup.ts globally mocks useWebGL2Support to return true. This file
// is testing the hook itself, so we need to unmock + use the real
// implementation.
vi.unmock('@/hooks/useWebGL2Support');

import { useWebGL2Support } from '@/hooks/useWebGL2Support';
import { _resetWebGL2Cache } from '@/lib/webgl';
import React from 'react';

function Probe() {
    const supported = useWebGL2Support();
    return React.createElement('span', { 'data-testid': 'probe' }, supported ? 'yes' : 'no');
}

afterEach(() => {
    _resetWebGL2Cache();
    vi.restoreAllMocks();
});

describe('useWebGL2Support', () => {
    it('returns false after mount in jsdom (no WebGL context)', async () => {
        render(<Probe />);
        // Initial render returns `true` (SSR-safe optimistic default);
        // the mount effect runs synchronously in jsdom under React 19
        // and corrects the state before the next paint, so by the time
        // we query, the corrected value is in the DOM.
        expect(screen.getByTestId('probe').textContent).toBe('no');
    });

    it('returns true when getContext returns a WebGL2 context', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
            {} as unknown as RenderingContext,
        );
        render(<Probe />);
        expect(screen.getByTestId('probe').textContent).toBe('yes');
    });
});
