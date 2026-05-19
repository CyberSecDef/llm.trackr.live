import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/Components/ui/button';

describe('<Button />', () => {
    it('renders with default variant + size classes', () => {
        render(<Button>Click me</Button>);
        const button = screen.getByRole('button', { name: 'Click me' });
        expect(button).toBeInTheDocument();
        expect(button.className).toContain('bg-primary');
        expect(button.className).toContain('h-10');
    });

    it('applies destructive variant classes', () => {
        render(<Button variant="destructive">Delete</Button>);
        expect(screen.getByRole('button').className).toContain('bg-destructive');
    });

    it('applies size variants', () => {
        const { rerender } = render(<Button size="sm">Small</Button>);
        expect(screen.getByRole('button').className).toContain('h-9');

        rerender(<Button size="lg">Large</Button>);
        expect(screen.getByRole('button').className).toContain('h-11');

        rerender(<Button size="icon">i</Button>);
        expect(screen.getByRole('button').className).toContain('w-10');
    });

    it('merges caller className over variant defaults via cn()', () => {
        render(
            <Button size="default" className="h-20">
                Tall
            </Button>,
        );
        // tailwind-merge resolves the conflict: caller h-20 wins over default h-10.
        expect(screen.getByRole('button').className).toContain('h-20');
        expect(screen.getByRole('button').className).not.toContain('h-10');
    });

    it('forwards refs to the underlying button', () => {
        const ref = { current: null as HTMLButtonElement | null };
        render(<Button ref={ref}>X</Button>);
        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('renders as a different element when asChild is set', () => {
        render(
            <Button asChild>
                <a href="/somewhere">link button</a>
            </Button>,
        );
        const link = screen.getByRole('link', { name: 'link button' });
        expect(link).toBeInTheDocument();
        expect(link.tagName).toBe('A');
        // Should still get button classes.
        expect(link.className).toContain('bg-primary');
    });

    it('respects the disabled attribute', () => {
        render(<Button disabled>nope</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });
});
