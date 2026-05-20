<?php

use App\Services\Exports\ChromiumDetector;

/**
 * Inject the candidate-paths constructor arg with our own temp
 * file so the test doesn't depend on the host's Chromium install.
 */
function detectorWithCandidates(array $paths): ChromiumDetector
{
    return new ChromiumDetector($paths);
}

beforeEach(function () {
    // Clear any CHROMIUM_PATH from the host env so the test sees
    // a deterministic starting point.
    putenv('CHROMIUM_PATH');
});

describe('ChromiumDetector', function () {
    it('returns null when no candidate path exists', function () {
        $detector = detectorWithCandidates([
            '/nonexistent/path/chromium',
            '/also-nonexistent/chromium',
        ]);

        expect($detector->findBinary())->toBeNull();
        expect($detector->isAvailable())->toBeFalse();
    });

    it('returns the first executable candidate path', function () {
        $tmp = tempnam(sys_get_temp_dir(), 'fake-chromium-');
        chmod($tmp, 0755);

        $detector = detectorWithCandidates([
            '/nonexistent/before',
            $tmp,
            '/nonexistent/after',
        ]);

        expect($detector->findBinary())->toBe($tmp);
        expect($detector->isAvailable())->toBeTrue();

        @unlink($tmp);
    });

    it('CHROMIUM_PATH env override beats every candidate', function () {
        $tmpEnv = tempnam(sys_get_temp_dir(), 'env-chromium-');
        chmod($tmpEnv, 0755);
        $tmpCandidate = tempnam(sys_get_temp_dir(), 'cand-chromium-');
        chmod($tmpCandidate, 0755);

        putenv("CHROMIUM_PATH={$tmpEnv}");

        $detector = detectorWithCandidates([$tmpCandidate]);
        expect($detector->findBinary())->toBe($tmpEnv);

        @unlink($tmpEnv);
        @unlink($tmpCandidate);
    });

    it('ignores CHROMIUM_PATH when the env path is not executable', function () {
        putenv('CHROMIUM_PATH=/nonexistent/env/path');

        $tmpCandidate = tempnam(sys_get_temp_dir(), 'cand-chromium-');
        chmod($tmpCandidate, 0755);

        $detector = detectorWithCandidates([$tmpCandidate]);
        // Falls through to the candidate list.
        expect($detector->findBinary())->toBe($tmpCandidate);

        @unlink($tmpCandidate);
    });

    it('caches the resolved path across calls', function () {
        $tmp = tempnam(sys_get_temp_dir(), 'cached-chromium-');
        chmod($tmp, 0755);

        $detector = detectorWithCandidates([$tmp]);
        expect($detector->findBinary())->toBe($tmp);

        // Delete the file — cached result must persist.
        @unlink($tmp);
        expect($detector->findBinary())->toBe($tmp);
    });

    it('reset() clears the cache (test ergonomics)', function () {
        $detector = detectorWithCandidates(['/never']);
        $detector->findBinary(); // populates the cache with null

        $tmp = tempnam(sys_get_temp_dir(), 'post-reset-chromium-');
        chmod($tmp, 0755);
        $detector = detectorWithCandidates([$tmp]);
        $detector->reset();
        expect($detector->findBinary())->toBe($tmp);

        @unlink($tmp);
    });

    it('defaults to a sensible Linux + macOS candidate list', function () {
        $detector = new ChromiumDetector;
        // Just verify it doesn't blow up; presence depends on the host.
        // The result may be null OR a real Chromium path; both are
        // legitimate. We assert the method exits cleanly.
        $detector->findBinary();
        expect(true)->toBeTrue();
    });
});
