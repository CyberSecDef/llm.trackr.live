import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ParameterControls, {
    PARAM_DEFAULTS,
    type ParameterValues,
    type SupportedParams,
} from '@/Components/ParameterControls';

const defaultValue: ParameterValues = { ...PARAM_DEFAULTS, seed: null };

function renderControls({
    value = defaultValue,
    supported = null as SupportedParams | null,
    onChange = vi.fn(),
    maxTokensCeiling = 8192,
} = {}) {
    const utils = render(
        <ParameterControls
            value={value}
            onChange={onChange}
            supported={supported}
            maxTokensCeiling={maxTokensCeiling}
        />,
    );
    return { ...utils, onChange };
}

describe('<ParameterControls />', () => {
    it('renders collapsed by default; body not in document', () => {
        renderControls();
        expect(screen.queryByTestId('parameter-controls-body')).not.toBeInTheDocument();
        expect(screen.getByTestId('parameter-controls-toggle')).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });

    it('expands when the toggle is clicked', async () => {
        const user = userEvent.setup();
        renderControls();
        await user.click(screen.getByTestId('parameter-controls-toggle'));
        expect(screen.getByTestId('parameter-controls-body')).toBeInTheDocument();
    });

    it('does not show the custom-dot when values are at defaults', () => {
        renderControls();
        expect(screen.queryByTestId('parameter-custom-dot')).not.toBeInTheDocument();
    });

    it('shows the custom-dot when any value is non-default', () => {
        renderControls({ value: { ...defaultValue, temperature: 1.2 } });
        expect(screen.getByTestId('parameter-custom-dot')).toBeInTheDocument();
    });

    it('fires onChange when a numeric input is edited', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        renderControls({ onChange });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        const input = screen.getByTestId('temperature-input');
        fireEvent.change(input, { target: { value: '1.5' } });
        // onChange called with the new shape (whole parameters object).
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ temperature: 1.5 }));
    });

    it('clamps out-of-range numeric input to the slider bounds', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        renderControls({ onChange });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        // Try to push temperature to 5 (above the max=2 cap).
        fireEvent.change(screen.getByTestId('temperature-input'), { target: { value: '5' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ temperature: 2 }));
    });

    it('marks unsupported params with the "(not supported)" hint', async () => {
        const user = userEvent.setup();
        renderControls({
            supported: {
                temperature: true,
                top_p: true,
                top_k: false,
                max_tokens: true,
                seed: false,
            },
        });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        expect(screen.getByTestId('top_k-unsupported')).toBeInTheDocument();
        expect(screen.getByTestId('seed-unsupported')).toBeInTheDocument();
        expect(screen.queryByTestId('temperature-unsupported')).not.toBeInTheDocument();
    });

    it('disables the slider + input for unsupported params', async () => {
        const user = userEvent.setup();
        renderControls({
            supported: {
                temperature: true,
                top_p: true,
                top_k: false,
                max_tokens: true,
                seed: true,
            },
        });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        expect(screen.getByTestId('top_k-slider')).toHaveAttribute('data-disabled');
        expect(screen.getByTestId('top_k-input')).toBeDisabled();
    });

    it('Reset link sends the full default object', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        renderControls({ value: { ...defaultValue, temperature: 1.7 }, onChange });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        await user.click(screen.getByTestId('parameter-reset'));
        expect(onChange).toHaveBeenCalledWith({ ...PARAM_DEFAULTS, seed: null });
    });

    it('uses model context_length as the max_tokens ceiling', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        renderControls({ onChange, maxTokensCeiling: 4096 });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        // Pushing past the ceiling clamps to it.
        fireEvent.change(screen.getByTestId('max_tokens-input'), { target: { value: '99999' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ max_tokens: 4096 }));
    });

    it('seed field sends null when emptied', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        renderControls({ value: { ...defaultValue, seed: 1234 }, onChange });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        fireEvent.change(screen.getByTestId('seed-input'), { target: { value: '' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ seed: null }));
    });

    it('seed Random link clears the value', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        renderControls({ value: { ...defaultValue, seed: 42 }, onChange });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        await user.click(screen.getByTestId('seed-randomize'));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ seed: null }));
    });

    it('treats missing supported_params as "all supported"', async () => {
        const user = userEvent.setup();
        renderControls({ supported: null });
        await user.click(screen.getByTestId('parameter-controls-toggle'));

        expect(screen.queryByTestId('temperature-unsupported')).not.toBeInTheDocument();
        expect(screen.queryByTestId('top_p-unsupported')).not.toBeInTheDocument();
        expect(screen.queryByTestId('top_k-unsupported')).not.toBeInTheDocument();
    });
});
