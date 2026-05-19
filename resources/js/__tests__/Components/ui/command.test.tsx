import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/Components/ui/command';

describe('<Command />', () => {
    it('renders items + groups', () => {
        render(
            <Command>
                <CommandInput placeholder="Search…" />
                <CommandList>
                    <CommandEmpty>No results.</CommandEmpty>
                    <CommandGroup heading="Fruits">
                        <CommandItem value="apple">Apple</CommandItem>
                        <CommandItem value="banana">Banana</CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>,
        );
        expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
        expect(screen.getByText('Apple')).toBeInTheDocument();
        expect(screen.getByText('Banana')).toBeInTheDocument();
    });

    it('filters items as the user types', async () => {
        const user = userEvent.setup();
        render(
            <Command>
                <CommandInput placeholder="Search…" />
                <CommandList>
                    <CommandEmpty>No results.</CommandEmpty>
                    <CommandGroup>
                        <CommandItem value="apple">Apple</CommandItem>
                        <CommandItem value="banana">Banana</CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>,
        );
        await user.type(screen.getByPlaceholderText('Search…'), 'ban');
        expect(screen.queryByText('Apple')).not.toBeInTheDocument();
        expect(screen.getByText('Banana')).toBeInTheDocument();
    });

    it('shows the empty state when no items match', async () => {
        const user = userEvent.setup();
        render(
            <Command>
                <CommandInput placeholder="Search…" />
                <CommandList>
                    <CommandEmpty>No results.</CommandEmpty>
                    <CommandGroup>
                        <CommandItem value="apple">Apple</CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>,
        );
        await user.type(screen.getByPlaceholderText('Search…'), 'zzz');
        expect(screen.getByText('No results.')).toBeInTheDocument();
    });

    it('fires onSelect when an item is chosen', async () => {
        const user = userEvent.setup();
        const handleSelect = vi.fn();
        render(
            <Command>
                <CommandList>
                    <CommandGroup>
                        <CommandItem value="apple" onSelect={handleSelect}>
                            Apple
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>,
        );
        await user.click(screen.getByText('Apple'));
        expect(handleSelect).toHaveBeenCalledWith('apple');
    });
});
