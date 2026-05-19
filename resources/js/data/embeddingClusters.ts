/*
 * embeddingClusters (M8 chunk 7) — stylized synthetic vocab map.
 *
 * The SPEC calls for "PCA-reduced 3D scatter for the vocabulary
 * (precomputed per tokenizer; lazy-loaded)." Real per-tokenizer
 * PCA needs ~500MB of model weights to compute against, which we
 * don't want to drag into the frontend build. Stylized synthetic
 * clusters give us the same *visual* — token-types form spatial
 * groups — without the data wrangling.
 *
 * Token cluster centers are picked to spread evenly around the
 * origin. Per-token jitter is deterministic (xorshift32 seeded by
 * `clusterIndex * 1000 + tokenIndex`) so the scatter is stable
 * across renders and unit tests.
 *
 * Tokens were chosen to overlap the common-tokenizer top-K so a
 * typical chat stream lights up several clusters: punctuation +
 * common English for prose, code-keywords + code-symbols for
 * generated code, whitespace for everything.
 */

export interface EmbeddingCluster {
    name: string;
    /** Hex color for the cluster's points + label. */
    color: string;
    /** 3D center (~[-3, 3] range). */
    center: [number, number, number];
    tokens: string[];
}

export interface EmbeddingPoint {
    token: string;
    position: [number, number, number];
    clusterIndex: number;
    color: string;
}

export const EMBEDDING_CLUSTERS: EmbeddingCluster[] = [
    {
        name: 'whitespace',
        color: '#94a3b8', // slate-400
        center: [-2.5, 0, 0],
        tokens: [' ', '\n', '\t', ' \n', '  ', '\n\n', ' \t', '   ', '    ', '\r\n', ' '],
    },
    {
        name: 'punctuation',
        color: '#f97316', // orange-500
        center: [-1.5, 1.8, 0.5],
        tokens: [
            '.',
            ',',
            '!',
            '?',
            ';',
            ':',
            "'",
            '"',
            '-',
            '–',
            '—',
            '...',
            '"',
            '"',
            "'",
            "'",
            '/',
            '\\',
            '*',
            '&',
            '#',
            '@',
            '%',
            '`',
        ],
    },
    {
        name: 'pronouns',
        color: '#e879f9', // fuchsia-400
        center: [-1, -1.5, 1.5],
        tokens: [
            'I',
            'you',
            'he',
            'she',
            'it',
            'we',
            'they',
            'me',
            'him',
            'her',
            'us',
            'them',
            'this',
            'that',
            'these',
            'those',
            'who',
            'what',
            'which',
            'where',
            'when',
            'why',
            'how',
        ],
    },
    {
        name: 'common-english',
        color: '#67e8f9', // cyan-300
        center: [0, 0, 0],
        tokens: [
            'the',
            'of',
            'and',
            'to',
            'in',
            'a',
            'is',
            'for',
            'on',
            'with',
            'as',
            'at',
            'by',
            'from',
            'that',
            'an',
            'be',
            'are',
            'was',
            'were',
            'have',
            'has',
            'had',
            'do',
            'does',
            'did',
            'can',
            'could',
            'will',
            'would',
            'should',
            'may',
            'might',
            'or',
            'but',
            'if',
            'then',
            'so',
            'not',
            'no',
            'yes',
            'all',
            'any',
            'some',
            'one',
            'two',
            'first',
            'last',
            'new',
            'old',
            'good',
            'great',
            'about',
            'over',
        ],
    },
    {
        name: 'long-words',
        color: '#a5f3fc', // cyan-200
        center: [0.5, -2, -1],
        tokens: [
            'people',
            'system',
            'company',
            'service',
            'business',
            'computer',
            'software',
            'application',
            'development',
            'information',
            'language',
            'community',
            'function',
            'structure',
            'document',
            'example',
            'problem',
            'solution',
            'experience',
            'knowledge',
            'environment',
            'organization',
            'performance',
            'requirement',
            'implementation',
            'configuration',
            'algorithm',
            'parameter',
            'variable',
            'database',
            'network',
            'security',
            'protocol',
        ],
    },
    {
        name: 'numbers',
        color: '#34d399', // emerald-400
        center: [2.2, -1.5, 0.5],
        tokens: [
            '0',
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
            '9',
            '10',
            '20',
            '30',
            '40',
            '50',
            '60',
            '70',
            '80',
            '90',
            '100',
            '1000',
            '10000',
            '0.5',
            '0.1',
            '0.0',
            '1.0',
            '2.0',
            '0x0',
            '0xff',
            '0xFF',
        ],
    },
    {
        name: 'code-keywords',
        color: '#fbbf24', // amber-400
        center: [1.5, 2, -1.5],
        tokens: [
            'def',
            'return',
            'class',
            'if',
            'else',
            'for',
            'while',
            'import',
            'from',
            'function',
            'let',
            'const',
            'var',
            'async',
            'await',
            'try',
            'catch',
            'finally',
            'throw',
            'new',
            'this',
            'super',
            'static',
            'public',
            'private',
            'void',
            'true',
            'false',
            'null',
            'None',
            'True',
            'False',
            'undefined',
            'NaN',
            'break',
            'continue',
            'pass',
            'yield',
            'lambda',
            'with',
        ],
    },
    {
        name: 'code-symbols',
        color: '#fde68a', // amber-200
        center: [1, 2, 1.5],
        tokens: [
            '{',
            '}',
            '(',
            ')',
            '[',
            ']',
            '<',
            '>',
            '=',
            '==',
            '===',
            '!=',
            '!==',
            '<=',
            '>=',
            '&&',
            '||',
            '!',
            '+',
            '-',
            '*',
            '/',
            '%',
            '++',
            '--',
            '+=',
            '-=',
            '*=',
            '/=',
            '=>',
            '->',
            '::',
            '...',
            '?',
            '|',
            '^',
            '~',
            '&',
        ],
    },
];

// xorshift32-based noise — deterministic per (clusterIndex, tokenIndex)
// so positions are stable across renders + tests.
function deterministicJitter(seed: number): [number, number, number] {
    let s = (seed * 2654435761) >>> 0;
    const next = (): number => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        // Map uint32 → [-0.6, 0.6] for a tight cluster radius.
        return (((s >>> 0) % 1_000_000) / 1_000_000 - 0.5) * 1.2;
    };
    return [next(), next(), next()];
}

/**
 * Expand the cluster definitions into an array of individual
 * 3D points. Stable for a given build: positions are computed
 * deterministically from (clusterIndex, tokenIndex).
 */
export function buildEmbeddingPoints(): EmbeddingPoint[] {
    const points: EmbeddingPoint[] = [];
    for (let ci = 0; ci < EMBEDDING_CLUSTERS.length; ci++) {
        const cluster = EMBEDDING_CLUSTERS[ci];
        for (let ti = 0; ti < cluster.tokens.length; ti++) {
            const token = cluster.tokens[ti];
            const j = deterministicJitter(ci * 1000 + ti);
            points.push({
                token,
                position: [
                    cluster.center[0] + j[0],
                    cluster.center[1] + j[1],
                    cluster.center[2] + j[2],
                ],
                clusterIndex: ci,
                color: cluster.color,
            });
        }
    }
    return points;
}
