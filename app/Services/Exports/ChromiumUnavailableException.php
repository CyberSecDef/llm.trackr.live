<?php

namespace App\Services\Exports;

use RuntimeException;

/**
 * Raised by `PuppeteerFrameRenderer` when no Chromium binary is
 * available at render time (M10 chunk 4).
 *
 * Distinct from the generic `RuntimeException` so chunk 6's
 * fallback path can catch THIS specifically and route the export
 * through the SVG renderer instead of failing the job outright.
 * Other puppeteer-side failures (missing Node script, Node
 * crashed mid-capture, etc.) keep raising plain RuntimeException
 * and propagate up to `failed_jobs` for operator inspection.
 */
final class ChromiumUnavailableException extends RuntimeException {}
