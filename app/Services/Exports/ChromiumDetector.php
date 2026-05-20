<?php

namespace App\Services\Exports;

/**
 * Boot-time check for a usable Chromium binary (M10 chunk 4).
 *
 * The Puppeteer-renderer path needs a headless browser; on hosts
 * where one isn't installed we want to detect that ONCE at app
 * boot, log a warning, and let chunk 6's fallback flip to the
 * SVG renderer rather than crash every export with a cryptic
 * "Cannot find Chrome installation" message from Node.
 *
 * Resolution order:
 *   1. `CHROMIUM_PATH` env (operator override; useful for snap /
 *      flatpak installs that don't live on a standard path).
 *   2. The standard Linux + macOS install locations, in
 *      preference order: chromium, chromium-browser, google-chrome,
 *      google-chrome-stable, plus macOS's Application Support path.
 *
 * Cached on a singleton — calling `findBinary()` 100×/job is free
 * after the first invocation. Resetting between tests is done via
 * `reset()`.
 */
class ChromiumDetector
{
    /** Default Linux + macOS lookup paths, in preference order. */
    private const DEFAULT_CANDIDATE_PATHS = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];

    /** @var list<string> */
    private array $candidatePaths;

    private ?string $cached = null;

    private bool $checked = false;

    public function __construct(?array $candidatePaths = null)
    {
        $this->candidatePaths = $candidatePaths ?? self::DEFAULT_CANDIDATE_PATHS;
    }

    /**
     * Absolute path to the resolved Chromium binary, or null when
     * none was found. Result is cached for the lifetime of the
     * service — call `reset()` between tests.
     */
    public function findBinary(): ?string
    {
        if ($this->checked) {
            return $this->cached;
        }
        $this->checked = true;

        $envOverride = getenv('CHROMIUM_PATH');
        if (is_string($envOverride) && $envOverride !== '' && $this->isExecutable($envOverride)) {
            return $this->cached = $envOverride;
        }

        foreach ($this->candidatePaths as $path) {
            if ($this->isExecutable($path)) {
                return $this->cached = $path;
            }
        }

        return $this->cached = null;
    }

    public function isAvailable(): bool
    {
        return $this->findBinary() !== null;
    }

    /** Clears the cache. Tests use this; production code shouldn't. */
    public function reset(): void
    {
        $this->cached = null;
        $this->checked = false;
    }

    /**
     * Indirection so tests can swap (subclasses can override).
     * Real impl: `is_executable($path)`.
     */
    protected function isExecutable(string $path): bool
    {
        return is_executable($path);
    }
}
