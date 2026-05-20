import { describe, expect, it } from 'vitest';
import { OKABE_ITO, VIRIDIS_DOMAIN, VIRIDIS_STOPS } from '@/lib/palettes';
import { EMBEDDING_CLUSTERS } from '@/data/embeddingClusters';

describe('palettes', () => {
    it('VIRIDIS_STOPS is the canonical 5-stop sequential palette', () => {
        expect(VIRIDIS_STOPS).toEqual(['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']);
    });

    it('VIRIDIS_DOMAIN pairs 1:1 with VIRIDIS_STOPS', () => {
        expect(VIRIDIS_DOMAIN).toHaveLength(VIRIDIS_STOPS.length);
        expect(VIRIDIS_DOMAIN[0]).toBe(0);
        expect(VIRIDIS_DOMAIN[VIRIDIS_DOMAIN.length - 1]).toBe(1);
    });

    it('OKABE_ITO is the 7-chromatic + white neutral CB-safe palette', () => {
        expect(OKABE_ITO).toEqual([
            '#e69f00',
            '#56b4e9',
            '#009e73',
            '#f0e442',
            '#0072b2',
            '#d55e00',
            '#cc79a7',
            '#ffffff',
        ]);
    });

    it('OKABE_ITO has no duplicate colors (every cluster gets a distinct hue)', () => {
        const unique = new Set(OKABE_ITO);
        expect(unique.size).toBe(OKABE_ITO.length);
    });
});

describe('EmbeddingClusters use only Okabe-Ito colors', () => {
    it('every cluster color is in OKABE_ITO', () => {
        for (const cluster of EMBEDDING_CLUSTERS) {
            expect(OKABE_ITO).toContain(cluster.color);
        }
    });

    it('no two clusters share the same color', () => {
        const colors = EMBEDDING_CLUSTERS.map((c) => c.color);
        const unique = new Set(colors);
        expect(unique.size).toBe(colors.length);
    });

    it('explicitly does NOT include any of the old M8 palette hexes', () => {
        const banned = [
            '#94a3b8',
            '#f97316',
            '#e879f9',
            '#67e8f9',
            '#a5f3fc',
            '#34d399',
            '#fbbf24',
            '#fde68a',
        ];
        for (const cluster of EMBEDDING_CLUSTERS) {
            expect(banned).not.toContain(cluster.color);
        }
    });
});
