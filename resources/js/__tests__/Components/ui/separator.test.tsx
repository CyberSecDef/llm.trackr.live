import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from '@/Components/ui/separator';

describe('<Separator />', () => {
    it('renders a horizontal separator by default', () => {
        render(<Separator data-testid="s" />);
        const el = screen.getByTestId('s');
        expect(el.className).toContain('h-[1px]');
        expect(el.className).toContain('w-full');
    });

    it('renders vertical when orientation=vertical', () => {
        render(<Separator data-testid="s" orientation="vertical" />);
        const el = screen.getByTestId('s');
        expect(el.className).toContain('w-[1px]');
        expect(el.className).toContain('h-full');
    });

    it('drops a11y attrs when decorative=true (default)', () => {
        render(<Separator data-testid="s" />);
        const el = screen.getByTestId('s');
        expect(el).toHaveAttribute('role', 'none');
    });

    it('emits separator semantics when decorative=false', () => {
        render(<Separator data-testid="s" decorative={false} />);
        const el = screen.getByTestId('s');
        expect(el).toHaveAttribute('role', 'separator');
        expect(el).toHaveAttribute('aria-orientation', 'horizontal');
    });
});
