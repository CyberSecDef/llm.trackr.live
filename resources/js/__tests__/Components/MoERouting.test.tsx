import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MoERouting from '@/Components/MoERouting';
import type { RunEvent } from '@/types/runs';

function routingEvent(tokenIndex: number, experts: number[], scores: number[]): RunEvent {
    return {
        event: 'moe.routed',
        payload: { run_id: 1, token_index: tokenIndex, experts, scores },
    };
}

describe('<MoERouting />', () => {
    it('renders null when no moe.routed events are present', () => {
        const { container } = render(<MoERouting events={[]} totalExperts={8} activeExperts={2} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders the header with N experts and top-K active', () => {
        render(
            <MoERouting
                events={[routingEvent(0, [0, 3], [0.6, 0.4])]}
                totalExperts={8}
                activeExperts={2}
            />,
        );
        const header = screen.getByTestId('moe-routing-header');
        expect(header.textContent).toContain('8 experts');
        expect(header.textContent).toContain('top-2');
    });

    it('renders one router-score bar per active expert (latest event)', () => {
        render(
            <MoERouting
                events={[routingEvent(0, [0, 1], [0.5, 0.5]), routingEvent(1, [3, 7], [0.6, 0.4])]}
                totalExperts={8}
                activeExperts={2}
            />,
        );
        const bars = screen.getByTestId('moe-router-bars');
        const rows = within(bars).getAllByTestId(/moe-router-row-/);
        expect(rows).toHaveLength(2);
        // Latest event's experts are 3 and 7 (descending by score).
        expect(rows[0].textContent).toContain('Expert 3');
        expect(rows[1].textContent).toContain('Expert 7');
    });

    it('shows percentages summing to ~100% across the router bars', () => {
        render(
            <MoERouting
                events={[routingEvent(0, [0, 1, 2], [0.5, 0.3, 0.2])]}
                totalExperts={8}
                activeExperts={3}
            />,
        );
        // Grab the trailing % label on each router row via the
        // `tabular-nums` class — that span is the only place the
        // percentage is rendered as text (bars carry % only via
        // inline style width).
        const rows = screen
            .getByTestId('moe-router-bars')
            .querySelectorAll('[data-testid^="moe-router-row-"]');
        let total = 0;
        rows.forEach((row) => {
            const span = row.querySelector('.tabular-nums');
            const pct = span?.textContent?.match(/(\d+\.\d+)/)?.[1];
            if (pct) total += parseFloat(pct);
        });
        expect(total).toBeGreaterThan(99);
        expect(total).toBeLessThan(101);
    });

    it('renders one utilization bar per expert in the pool', () => {
        render(
            <MoERouting
                events={[routingEvent(0, [0, 3], [0.6, 0.4]), routingEvent(1, [3, 7], [0.6, 0.4])]}
                totalExperts={8}
                activeExperts={2}
            />,
        );
        const grid = screen.getByTestId('moe-utilization-bars');
        const bars = within(grid).getAllByTestId(/moe-util-bar-/);
        expect(bars).toHaveLength(8);
        // Bar id 3 was activated twice; bar 0 once; bar 1 never.
        expect(bars[3].getAttribute('data-count')).toBe('2');
        expect(bars[0].getAttribute('data-count')).toBe('1');
        expect(bars[1].getAttribute('data-count')).toBe('0');
    });

    it('reports the routed-token + activation totals in the utilization caption', () => {
        render(
            <MoERouting
                events={[routingEvent(0, [0, 3], [0.6, 0.4]), routingEvent(1, [3, 7], [0.6, 0.4])]}
                totalExperts={8}
                activeExperts={2}
            />,
        );
        const util = screen.getByTestId('moe-utilization');
        expect(util.textContent).toContain('2 routed tokens');
        expect(util.textContent).toContain('4 activations');
    });

    it('falls back to max-id+1 sizing when totalExperts is null', () => {
        render(
            <MoERouting
                events={[routingEvent(0, [0, 5], [0.5, 0.5])]}
                totalExperts={null}
                activeExperts={null}
            />,
        );
        const grid = screen.getByTestId('moe-utilization-bars');
        const bars = within(grid).getAllByTestId(/moe-util-bar-/);
        expect(bars).toHaveLength(6); // 0..5
    });

    it('marks unused experts with data-count=0 (visible as dimmed bars)', () => {
        render(
            <MoERouting
                events={[routingEvent(0, [0, 1], [0.5, 0.5])]}
                totalExperts={4}
                activeExperts={2}
            />,
        );
        expect(screen.getByTestId('moe-util-bar-2').getAttribute('data-count')).toBe('0');
        expect(screen.getByTestId('moe-util-bar-3').getAttribute('data-count')).toBe('0');
    });
});
