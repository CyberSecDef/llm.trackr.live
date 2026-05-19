import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Label } from '@/Components/ui/label';

describe('<Label />', () => {
    it('renders a label element with text', () => {
        render(<Label>Email</Label>);
        expect(screen.getByText('Email').tagName).toBe('LABEL');
    });

    it('associates with an input via htmlFor', () => {
        render(<Label htmlFor="email">Email</Label>);
        expect(screen.getByText('Email')).toHaveAttribute('for', 'email');
    });

    it('caller className overrides the base via cn()', () => {
        render(
            <Label data-testid="l" className="text-2xl">
                X
            </Label>,
        );
        expect(screen.getByTestId('l').className).toContain('text-2xl');
        expect(screen.getByTestId('l').className).not.toContain('text-sm');
    });
});
