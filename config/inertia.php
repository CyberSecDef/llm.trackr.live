<?php

return [
    /*
     * The `inertia.pages.*` values feed Inertia's view-finder — used by
     * `assertInertia(...)->component()` to verify the referenced page
     * file actually exists on disk. The defaults are Vue-centric
     * (`.vue` extension, no TSX); we override to point at our React
     * pages.
     *
     * Without this, `assertInertia` thinks none of our pages exist and
     * fails every Inertia test with `Inertia page component file [X]
     * does not exist.`
     */
    'pages' => [
        'paths' => [
            resource_path('js/Pages'),
        ],
        'extensions' => [
            'tsx',
            'jsx',
            'js',
            'ts',
        ],
    ],

    'testing' => [
        'ensure_pages_exist' => true,
    ],
];
