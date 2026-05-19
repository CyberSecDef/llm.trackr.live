import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/Components/ui/card';

describe('<Card /> subcomponents', () => {
    it('renders a full card composition', () => {
        render(
            <Card data-testid="card">
                <CardHeader>
                    <CardTitle>Title</CardTitle>
                    <CardDescription>Description</CardDescription>
                </CardHeader>
                <CardContent>Body text</CardContent>
                <CardFooter>Footer</CardFooter>
            </Card>,
        );

        expect(screen.getByText('Title')).toBeInTheDocument();
        expect(screen.getByText('Description')).toBeInTheDocument();
        expect(screen.getByText('Body text')).toBeInTheDocument();
        expect(screen.getByText('Footer')).toBeInTheDocument();
    });

    it('applies the card border + bg classes', () => {
        render(<Card data-testid="card">x</Card>);
        const card = screen.getByTestId('card');
        expect(card.className).toContain('bg-card');
        expect(card.className).toContain('border');
    });

    it('passes className through cn() so callers can override', () => {
        render(
            <Card data-testid="card" className="bg-red-500">
                x
            </Card>,
        );
        const card = screen.getByTestId('card');
        // Caller override wins over the base bg-card.
        expect(card.className).toContain('bg-red-500');
        expect(card.className).not.toContain('bg-card');
    });
});
