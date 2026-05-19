import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '@/Components/ui/input';

describe('<Input />', () => {
    it('renders an input element', () => {
        render(<Input placeholder="Email" />);
        expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    });

    it('honors the type prop', () => {
        render(<Input type="email" data-testid="i" />);
        expect(screen.getByTestId('i')).toHaveAttribute('type', 'email');
    });

    it('forwards onChange to the underlying input', async () => {
        const onChange = vi.fn();
        render(<Input data-testid="i" onChange={onChange} />);

        await userEvent.type(screen.getByTestId('i'), 'hello');
        expect(onChange).toHaveBeenCalled();
    });

    it('respects disabled state', () => {
        render(<Input data-testid="i" disabled />);
        expect(screen.getByTestId('i')).toBeDisabled();
    });

    it('caller className overrides the base via cn()', () => {
        render(<Input data-testid="i" className="h-20" />);
        const el = screen.getByTestId('i');
        expect(el.className).toContain('h-20');
        expect(el.className).not.toContain('h-10');
    });
});
