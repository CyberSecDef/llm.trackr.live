import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';

describe('<Popover />', () => {
    it('is closed by default; content not in the document', () => {
        render(
            <Popover>
                <PopoverTrigger>Open</PopoverTrigger>
                <PopoverContent>Body</PopoverContent>
            </Popover>,
        );
        expect(screen.queryByText('Body')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    });

    it('opens on trigger click and shows the content', async () => {
        const user = userEvent.setup();
        render(
            <Popover>
                <PopoverTrigger>Open</PopoverTrigger>
                <PopoverContent>Body</PopoverContent>
            </Popover>,
        );
        await user.click(screen.getByRole('button', { name: 'Open' }));
        expect(screen.getByText('Body')).toBeInTheDocument();
    });
});
