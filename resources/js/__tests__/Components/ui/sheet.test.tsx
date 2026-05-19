import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/Components/ui/sheet';

describe('<Sheet />', () => {
    it('is closed by default; content not in the document', () => {
        render(
            <Sheet>
                <SheetTrigger>Open</SheetTrigger>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>Title</SheetTitle>
                        <SheetDescription>Description</SheetDescription>
                    </SheetHeader>
                    <p>Body</p>
                </SheetContent>
            </Sheet>,
        );
        expect(screen.queryByText('Body')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    });

    it('opens on trigger click and shows the content', async () => {
        const user = userEvent.setup();
        render(
            <Sheet>
                <SheetTrigger>Open</SheetTrigger>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>Title</SheetTitle>
                        <SheetDescription>Description</SheetDescription>
                    </SheetHeader>
                    <p>Body</p>
                </SheetContent>
            </Sheet>,
        );

        await user.click(screen.getByRole('button', { name: 'Open' }));
        expect(screen.getByText('Body')).toBeInTheDocument();
        expect(screen.getByText('Title')).toBeInTheDocument();
    });

    it('applies left-side variant classes', async () => {
        const user = userEvent.setup();
        render(
            <Sheet>
                <SheetTrigger>Open</SheetTrigger>
                <SheetContent side="left" data-testid="content">
                    <SheetHeader>
                        <SheetTitle>T</SheetTitle>
                        <SheetDescription>D</SheetDescription>
                    </SheetHeader>
                </SheetContent>
            </Sheet>,
        );

        await user.click(screen.getByRole('button', { name: 'Open' }));
        const content = screen.getByTestId('content');
        expect(content.className).toContain('left-0');
        expect(content.className).toContain('border-r');
    });

    it('closes when the Close button is clicked', async () => {
        const user = userEvent.setup();
        render(
            <Sheet>
                <SheetTrigger>Open</SheetTrigger>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>T</SheetTitle>
                        <SheetDescription>D</SheetDescription>
                    </SheetHeader>
                    <p>Body</p>
                </SheetContent>
            </Sheet>,
        );

        await user.click(screen.getByRole('button', { name: 'Open' }));
        expect(screen.getByText('Body')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByText('Body')).not.toBeInTheDocument();
    });
});
