<?php

return [
    /*
     * Active renderer for GIF/MP4 exports.
     *
     *   'svg'        — default. PHP + Imagick + ffmpeg. 2D summary
     *                  view. No Chromium dependency. Lands in M10
     *                  chunk 2.
     *   'puppeteer'  — opt-in. Spawns headless Chrome to capture
     *                  the full 3D viz canvas. Lands in M10
     *                  chunk 4.
     *   'null'       — chunk 1 scaffolding. The factory returns
     *                  NullRenderer which throws on render().
     *                  Useful during local dev / testing of the
     *                  job pipeline without actual encoding.
     */
    'renderer' => env('GIF_RENDERER', 'null'),

    /*
     * Storage disk that holds the rendered files (exports/{id}.gif,
     * exports/{id}.mp4). Defaults to the local filesystem at
     * `storage/app/exports/`. Override to an S3 disk in prod.
     */
    'storage_disk' => env('GIF_EXPORT_DISK', 'local'),

    /*
     * Render frame rate (frames per second). 30 FPS matches the
     * M8 animation target and the manual recipe steps.
     */
    'frame_rate' => (int) env('GIF_FRAME_RATE', 30),

    /*
     * Hard ceiling on a single export's wall-clock time. The job
     * also has a timeout (set on the job class) so this is the
     * SECONDARY guard — the renderer can stop emitting frames
     * before it gets killed.
     */
    'max_duration_ms' => (int) env('GIF_MAX_DURATION_MS', 300_000),
];
