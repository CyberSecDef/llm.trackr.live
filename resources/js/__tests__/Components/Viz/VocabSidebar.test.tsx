import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VocabSidebar from '@/Components/Viz/VocabSidebar';
import type { BpeToken } from '@/lib/tokenizer';

const tok = (id: number, string: string): BpeToken => ({
    id,
    string,
    byteRange: [0, string.length],
});

describe('<VocabSidebar />', () => {
    it('shows the placeholder when no tokens have been revealed', () => {
        render(<VocabSidebar tokens={[]} revealedCount={0} />);
        expect(screen.getByText(/Populated during Scene 3/i)).toBeInTheDocument();
        expect(screen.queryByTestId('viz-vocab-list')).not.toBeInTheDocument();
    });

    it('renders the revealed-count rows + omits the rest', () => {
        const tokens = [tok(1, 'a'), tok(2, 'b'), tok(3, 'c')];
        render(<VocabSidebar tokens={tokens} revealedCount={2} />);
        const rows = screen.getAllByTestId(/viz-vocab-row-/);
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('a');
        expect(rows[1].textContent).toContain('b');
        // Token c is not revealed yet.
        expect(rows.some((r) => r.textContent?.includes('c'))).toBe(false);
    });

    it('highlights the most-recently-revealed row', () => {
        const tokens = [tok(1, 'a'), tok(2, 'b'), tok(3, 'c')];
        render(<VocabSidebar tokens={tokens} revealedCount={2} />);
        const recent = screen.getByTestId('viz-vocab-row-1');
        expect(recent.getAttribute('data-recent')).toBe('true');
        const older = screen.getByTestId('viz-vocab-row-0');
        expect(older.getAttribute('data-recent')).toBe('false');
    });

    it('shows the token string + id', () => {
        const tokens = [tok(42, 'hello')];
        render(<VocabSidebar tokens={tokens} revealedCount={1} />);
        const row = screen.getByTestId('viz-vocab-row-0');
        expect(row.textContent).toContain('hello');
        expect(row.textContent).toContain('42');
    });

    it('substitutes · for space and ↵ for newline', () => {
        const tokens = [tok(1, ' '), tok(2, '\n')];
        render(<VocabSidebar tokens={tokens} revealedCount={2} />);
        const row0 = screen.getByTestId('viz-vocab-row-0');
        const row1 = screen.getByTestId('viz-vocab-row-1');
        expect(row0.textContent).toContain('·');
        expect(row1.textContent).toContain('↵');
    });
});
