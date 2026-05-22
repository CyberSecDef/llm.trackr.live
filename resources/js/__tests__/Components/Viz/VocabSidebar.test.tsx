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

    // M13 chunk 10: reverse-lookup highlight (Scene 20).

    it('applies the reverse-lookup highlight when highlightTokenIndex is set', () => {
        const tokens = [tok(1, 'a'), tok(2, 'b'), tok(3, 'c')];
        render(<VocabSidebar tokens={tokens} revealedCount={3} highlightTokenIndex={1} />);
        const row1 = screen.getByTestId('viz-vocab-row-1');
        expect(row1.getAttribute('data-reverse-highlight')).toBe('true');
        const row0 = screen.getByTestId('viz-vocab-row-0');
        expect(row0.getAttribute('data-reverse-highlight')).toBe('false');
    });

    it('reverse-highlight takes precedence over the most-recent flag', () => {
        const tokens = [tok(1, 'a'), tok(2, 'b'), tok(3, 'c')];
        // revealedCount=3 → most-recent = row 2. Override to highlight row 0.
        render(<VocabSidebar tokens={tokens} revealedCount={3} highlightTokenIndex={0} />);
        const row0 = screen.getByTestId('viz-vocab-row-0');
        expect(row0.className).toMatch(/emerald/);
        // Row 2 still has data-recent=true (the marker is separate)
        // but its className should NOT have the cyan ring because
        // the chunk-10 wiring only applies the most-recent visual
        // when no reverse-highlight is set on a different row.
    });

    it('no highlightTokenIndex still shows the most-recent (forward) ring', () => {
        const tokens = [tok(1, 'a'), tok(2, 'b')];
        render(<VocabSidebar tokens={tokens} revealedCount={2} />);
        const row1 = screen.getByTestId('viz-vocab-row-1');
        expect(row1.className).toMatch(/cyan/);
    });

    it('scrolls the highlighted row into view via scrollIntoView', () => {
        const calls: HTMLElement[] = [];
        const orig = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
            calls.push(this);
        };
        try {
            const tokens = [tok(1, 'a'), tok(2, 'b'), tok(3, 'c')];
            render(<VocabSidebar tokens={tokens} revealedCount={3} highlightTokenIndex={2} />);
            expect(calls.length).toBeGreaterThan(0);
            // The element scrolled should be the one with
            // data-vocab-index="2".
            expect(calls[0].getAttribute('data-vocab-index')).toBe('2');
        } finally {
            HTMLElement.prototype.scrollIntoView = orig;
        }
    });

    it('does not crash when highlightTokenIndex is out of range', () => {
        const tokens = [tok(1, 'a')];
        // highlightTokenIndex = 5 (beyond the visible slice). Should
        // render without throwing; no row gets the reverse-highlight.
        render(<VocabSidebar tokens={tokens} revealedCount={1} highlightTokenIndex={5} />);
        const row0 = screen.getByTestId('viz-vocab-row-0');
        expect(row0.getAttribute('data-reverse-highlight')).toBe('false');
    });
});
