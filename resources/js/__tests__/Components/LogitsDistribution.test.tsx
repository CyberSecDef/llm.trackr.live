import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LogitsDistribution from '@/Components/LogitsDistribution';
import type { RunEvent, TokenLogprob } from '@/types/runs';

function tokenEvent(token: string, logprobs: TokenLogprob[] | null): RunEvent {
    return {
        event: 'token.received',
        payload: {
            run_id: 1,
            token,
            index: 0,
            t_ms: 100,
            logprobs,
            is_final: false,
        },
    };
}

describe('<LogitsDistribution />', () => {
    it('renders null when events have no logprobs', () => {
        const { container } = render(<LogitsDistribution events={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders null when all token events have null logprobs', () => {
        const { container } = render(
            <LogitsDistribution events={[tokenEvent('a', null), tokenEvent('b', null)]} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders the latest token's top alternatives as bars", () => {
        const events: RunEvent[] = [
            tokenEvent('Paris', [
                { token: 'Paris', logprob: Math.log(0.7) },
                { token: 'the', logprob: Math.log(0.15) },
                { token: 'located', logprob: Math.log(0.1) },
                { token: 'in', logprob: Math.log(0.05) },
            ]),
        ];
        render(<LogitsDistribution events={events} />);
        const bars = screen.getByTestId('logits-bars');
        const rows = within(bars).getAllByTestId(/logit-row-/);
        expect(rows).toHaveLength(4);
    });

    it('marks the chosen token row with data-chosen="true"', () => {
        const events: RunEvent[] = [
            tokenEvent('Paris', [
                { token: 'the', logprob: Math.log(0.2) },
                { token: 'Paris', logprob: Math.log(0.7) },
                { token: 'in', logprob: Math.log(0.1) },
            ]),
        ];
        render(<LogitsDistribution events={events} />);
        // The chosen token is 'Paris' which is highest-prob → first row.
        const firstRow = screen.getByTestId('logit-row-0');
        expect(firstRow.getAttribute('data-chosen')).toBe('true');
    });

    it("escapes whitespace tokens via JSON.stringify so they're visible", () => {
        const events: RunEvent[] = [
            tokenEvent('\n', [
                { token: '\n', logprob: Math.log(0.6) },
                { token: ' ', logprob: Math.log(0.4) },
            ]),
        ];
        render(<LogitsDistribution events={events} />);
        const row0 = screen.getByTestId('logit-row-0');
        // JSON.stringify("\n") === '"\\n"' — the row should contain
        // the literal escape, not a line break.
        expect(row0.textContent).toContain('"\\n"');
    });

    it('shows percentages summing to ~100%', () => {
        const events: RunEvent[] = [
            tokenEvent('a', [
                { token: 'a', logprob: Math.log(0.5) },
                { token: 'b', logprob: Math.log(0.3) },
                { token: 'c', logprob: Math.log(0.1) },
            ]),
        ];
        render(<LogitsDistribution events={events} />);
        // Pull every % string from the rendered DOM.
        const matches = screen.getByTestId('logits-bars').textContent?.match(/(\d+\.\d+)%/g);
        const total = matches?.reduce((acc, s) => acc + parseFloat(s), 0) ?? 0;
        // Should sum to ~100 within rounding tolerance.
        expect(total).toBeGreaterThan(99);
        expect(total).toBeLessThan(101);
    });

    it('caps at 10 alternatives (top-K)', () => {
        const logprobs: TokenLogprob[] = [];
        for (let i = 0; i < 20; i++) {
            logprobs.push({ token: `t${i}`, logprob: Math.log(0.05) });
        }
        render(<LogitsDistribution events={[tokenEvent('t0', logprobs)]} />);
        const rows = within(screen.getByTestId('logits-bars')).getAllByTestId(/logit-row-/);
        expect(rows).toHaveLength(10);
    });
});
