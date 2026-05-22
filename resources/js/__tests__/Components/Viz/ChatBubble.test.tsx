import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatBubble from '@/Components/Viz/ChatBubble';

describe('<ChatBubble />', () => {
    it('renders the placeholder when no tokens are provided', () => {
        render(<ChatBubble />);
        expect(screen.getByTestId('viz-chat-bubble-placeholder')).toBeInTheDocument();
        expect(screen.queryByTestId('viz-chat-bubble-text')).not.toBeInTheDocument();
    });

    it('renders the placeholder when tokens is empty', () => {
        render(<ChatBubble tokens={[]} />);
        expect(screen.getByTestId('viz-chat-bubble-placeholder')).toBeInTheDocument();
    });

    it('renders the concatenated text when tokens are present', () => {
        render(<ChatBubble tokens={[' The', ' quick', ' brown', ' fox']} />);
        const text = screen.getByTestId('viz-chat-bubble-text');
        expect(text.textContent).toContain(' The quick brown fox');
    });

    it('shows the token count', () => {
        render(<ChatBubble tokens={[' a', ' b', ' c']} />);
        const count = screen.getByTestId('viz-chat-bubble-count');
        expect(count.textContent).toContain('3 tokens');
    });

    it('shows " · complete" when isFinal=true', () => {
        render(<ChatBubble tokens={[' done']} isFinal={true} />);
        const count = screen.getByTestId('viz-chat-bubble-count');
        expect(count.textContent).toMatch(/complete/i);
    });

    it('omits " · complete" when isFinal=false', () => {
        render(<ChatBubble tokens={[' streaming']} isFinal={false} />);
        const count = screen.getByTestId('viz-chat-bubble-count');
        expect(count.textContent).not.toMatch(/complete/i);
    });

    it('renders the blinking cursor while streaming (isFinal=false)', () => {
        render(<ChatBubble tokens={[' a']} isFinal={false} />);
        expect(screen.getByTestId('viz-chat-bubble-cursor')).toBeInTheDocument();
    });

    it('hides the cursor when isFinal=true', () => {
        render(<ChatBubble tokens={[' a']} isFinal={true} />);
        expect(screen.queryByTestId('viz-chat-bubble-cursor')).not.toBeInTheDocument();
    });

    it('reports data-final attribute matching the prop', () => {
        const { container } = render(<ChatBubble tokens={[' a']} isFinal={true} />);
        const bubble = container.querySelector('[data-testid="viz-chat-bubble"]') as HTMLElement;
        expect(bubble.getAttribute('data-final')).toBe('true');
    });

    it('preserves whitespace in tokens (leading spaces)', () => {
        render(<ChatBubble tokens={[' a', ' b']} />);
        const text = screen.getByTestId('viz-chat-bubble-text');
        // " a b" with leading space preserved.
        expect(text.textContent?.startsWith(' a b')).toBe(true);
    });

    it('handles a single newline token', () => {
        render(<ChatBubble tokens={['first', '\n', 'second']} />);
        const text = screen.getByTestId('viz-chat-bubble-text');
        expect(text.textContent).toContain('first');
        expect(text.textContent).toContain('second');
    });
});
