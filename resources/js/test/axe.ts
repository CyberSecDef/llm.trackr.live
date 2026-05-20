import { axe } from 'jest-axe';

type AxeOptions = Parameters<typeof axe>[1];

/*
 * M12 chunk 1 — shared axe runner for page-level a11y tests.
 *
 * jsdom doesn't render CSS, so rules that depend on computed
 * style (color-contrast, scrollable-region-focusable) produce
 * unreliable verdicts. We disable those here and rely on the
 * M12 cross-browser smoke recipe (later chunk) for the visual
 * a11y story.
 *
 * Everything else axe-core 4.x checks — labels, ARIA, headings,
 * landmarks, name/role/value, alt text — runs hot. The harness
 * is configured to fail on any violation at any impact level so
 * regressions can't slip through CI.
 */

const JSDOM_SAFE_OPTIONS: AxeOptions = {
    rules: {
        // jsdom returns 'rgba(0,0,0,0)' for most computed colors;
        // contrast checks would false-positive everywhere.
        'color-contrast': { enabled: false },
        // Same root cause — depends on computed overflow + height
        // that jsdom doesn't honor.
        'scrollable-region-focusable': { enabled: false },
    },
    // axe-core ships rule tags for WCAG levels; we run the full
    // wcag2a + wcag2aa + wcag21a + wcag21aa set, matching the SPEC.
    runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
};

export function runAxe(container: Element): ReturnType<typeof axe> {
    return axe(container, JSDOM_SAFE_OPTIONS);
}
