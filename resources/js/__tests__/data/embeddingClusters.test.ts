import { describe, expect, it } from 'vitest';
import { EMBEDDING_CLUSTERS, buildEmbeddingPoints } from '@/data/embeddingClusters';

describe('embeddingClusters', () => {
    it('defines at least 6 semantic clusters', () => {
        expect(EMBEDDING_CLUSTERS.length).toBeGreaterThanOrEqual(6);
    });

    it('every cluster has at least 8 tokens', () => {
        for (const c of EMBEDDING_CLUSTERS) {
            expect(c.tokens.length).toBeGreaterThanOrEqual(8);
        }
    });

    it('every cluster has a valid hex color', () => {
        for (const c of EMBEDDING_CLUSTERS) {
            expect(c.color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
        }
    });

    it('every cluster has a 3D center', () => {
        for (const c of EMBEDDING_CLUSTERS) {
            expect(c.center).toHaveLength(3);
            for (const coord of c.center) {
                expect(typeof coord).toBe('number');
                expect(Number.isFinite(coord)).toBe(true);
            }
        }
    });
});

describe('buildEmbeddingPoints', () => {
    it('yields one point per cluster.token', () => {
        const points = buildEmbeddingPoints();
        const expected = EMBEDDING_CLUSTERS.reduce((acc, c) => acc + c.tokens.length, 0);
        expect(points).toHaveLength(expected);
    });

    it('every point has a 3D position with finite coordinates', () => {
        const points = buildEmbeddingPoints();
        for (const p of points) {
            expect(p.position).toHaveLength(3);
            for (const x of p.position) {
                expect(Number.isFinite(x)).toBe(true);
            }
        }
    });

    it('positions are within a bounded scatter window', () => {
        // Expect everything inside the [-4, 4] cube — cluster centers
        // sit in ~[-3, 3] and jitter is ~±0.6.
        const points = buildEmbeddingPoints();
        for (const p of points) {
            for (const x of p.position) {
                expect(Math.abs(x)).toBeLessThan(4);
            }
        }
    });

    it('is deterministic across calls', () => {
        const a = buildEmbeddingPoints();
        const b = buildEmbeddingPoints();
        for (let i = 0; i < a.length; i++) {
            expect(a[i].position).toEqual(b[i].position);
            expect(a[i].token).toBe(b[i].token);
        }
    });

    it('assigns each point to its source cluster index + color', () => {
        const points = buildEmbeddingPoints();
        let cursor = 0;
        for (let ci = 0; ci < EMBEDDING_CLUSTERS.length; ci++) {
            const cluster = EMBEDDING_CLUSTERS[ci];
            for (let ti = 0; ti < cluster.tokens.length; ti++) {
                const p = points[cursor++];
                expect(p.clusterIndex).toBe(ci);
                expect(p.color).toBe(cluster.color);
                expect(p.token).toBe(cluster.tokens[ti]);
            }
        }
    });
});
