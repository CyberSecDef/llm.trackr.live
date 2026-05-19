import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/Components/ui/alert-dialog';

function ConfirmHarness({ onConfirm }: { onConfirm: () => void }) {
    return (
        <AlertDialog>
            <AlertDialogTrigger>Delete</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete thread?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This permanently removes the thread + all its runs.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

describe('<AlertDialog />', () => {
    it('is closed by default; content not in the document', () => {
        render(<ConfirmHarness onConfirm={vi.fn()} />);
        expect(screen.queryByText(/permanently removes/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('opens on Trigger click', async () => {
        const user = userEvent.setup();
        render(<ConfirmHarness onConfirm={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: 'Delete' }));
        expect(screen.getByText(/permanently removes/)).toBeInTheDocument();
    });

    it('calls onConfirm when Action is clicked', async () => {
        const onConfirm = vi.fn();
        const user = userEvent.setup();
        render(<ConfirmHarness onConfirm={onConfirm} />);

        await user.click(screen.getByRole('button', { name: 'Delete' }));
        await user.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('closes without firing onConfirm when Cancel is clicked', async () => {
        const onConfirm = vi.fn();
        const user = userEvent.setup();
        render(<ConfirmHarness onConfirm={onConfirm} />);

        await user.click(screen.getByRole('button', { name: 'Delete' }));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onConfirm).not.toHaveBeenCalled();
        expect(screen.queryByText(/permanently removes/)).not.toBeInTheDocument();
    });
});
