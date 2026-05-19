import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from '@/Components/ui/textarea';

describe('<Textarea />', () => {
    it('renders a textarea element', () => {
        render(<Textarea placeholder="Type" />);
        expect(screen.getByPlaceholderText('Type').tagName).toBe('TEXTAREA');
    });

    it('forwards onChange to the underlying textarea', async () => {
        const onChange = vi.fn();
        render(<Textarea data-testid="t" onChange={onChange} />);

        await userEvent.type(screen.getByTestId('t'), 'hello');
        expect(onChange).toHaveBeenCalled();
    });

    it('respects disabled state', () => {
        render(<Textarea data-testid="t" disabled />);
        expect(screen.getByTestId('t')).toBeDisabled();
    });

    it('caller className overrides via cn()', () => {
        render(<Textarea data-testid="t" className="min-h-[200px]" />);
        const el = screen.getByTestId('t');
        expect(el.className).toContain('min-h-[200px]');
        expect(el.className).not.toContain('min-h-[80px]');
    });
});
