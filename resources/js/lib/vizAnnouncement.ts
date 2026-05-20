import type { RunEvent } from '@/types/runs';

/*
 * M12 chunk 3 — derive the screen-reader announcement string for the
 * Three.js Viz + Embedding canvases.
 *
 * Why milestones, not per-event:
 *   aria-live="polite" queues announcements but does not drop them.
 *   A 100-token stream would announce 100 lines back-to-back, which
 *   floods the AT queue. Per-decile milestones produce a useful
 *   narrative ("10 tokens generated... 20 tokens generated... Run
 *   complete.") without the flood.
 *
 * Why a single string return (not an event stream):
 *   React components hold the value in a useMemo + render it into a
 *   sr-only aria-live region. Same input → same output → no
 *   spurious announcements when the events array reference changes
 *   but its content doesn't materially change.
 *
 * `startedLabel` lets the two canvases differentiate their pre-token
 * state: "Run started." for VizPane, "Embedding scene loaded." for
 * EmbeddingScene.
 */

export function deriveVizAnnouncement(events: RunEvent[], startedLabel: string): string {
    if (events.length === 0) return '';

    const errored = events.find((e) => e.event === 'run.errored');
    if (errored && errored.event === 'run.errored') {
        return `Run errored: ${errored.payload.message}.`;
    }

    let tokenCount = 0;
    let completed = false;
    for (const e of events) {
        if (e.event === 'token.received') tokenCount++;
        else if (e.event === 'run.completed') completed = true;
    }

    if (completed) {
        const word = tokenCount === 1 ? 'token' : 'tokens';
        return `Run complete. ${tokenCount} ${word} generated.`;
    }

    const milestone = Math.floor(tokenCount / 10) * 10;
    if (milestone > 0) return `${milestone} tokens generated.`;
    return startedLabel;
}
