<?php

namespace App\Services\Exports;

use App\Models\Run;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Generates a PNG sequence for a Run by emitting one SVG per
 * frame and rasterizing via ImageMagick's `convert` CLI
 * (M10 chunk 2).
 *
 * Why CLI shell-out and not ext-imagick: chunk-2 decision. The
 * `convert` binary is part of any standard ImageMagick install;
 * the PHP extension is a separate package that adds an extra
 * `apt install php-imagick` to every deployment. Per-frame
 * process spawn is the cost; for the 30-FPS / ~100-token target
 * (~90 frames) the overhead is ~half a second on warm caches.
 *
 * Frame timing: sampled at `config.frameRate` from token_log
 * timestamps (chunk-2 decision). For each frame t_ms, the scene
 * state is derived purely from token_log entries with
 * `entry.t_ms <= frame_t_ms`. Output duration matches the
 * original run's last-token t_ms.
 *
 * 2D summary layout (1280x720):
 *
 *   +---------------------------------------------------------+
 *   | header: Run #N · Model · Vendor                  Xs     |
 *   +---------------------------------------------------------+
 *   | Assistant: live token text with blinking cursor         |
 *   | metrics: N out · X.X t/s                                |
 *   +-------------------------+-------------------------------+
 *   | ATTENTION heatmap       | LOGITS top-K bars             |
 *   |                         |                               |
 *   +-------------------------+-------------------------------+
 *   | MoE: latest scores + cumulative utilization (if MoE)    |
 *   +---------------------------------------------------------+
 *   |                             2D summary view  · frame N  |
 *   +---------------------------------------------------------+
 */
class SvgFrameRenderer implements FrameRenderer
{
    private const WIDTH = 1280;

    private const HEIGHT = 720;

    /** Per-frame fallback duration when token_log has zero entries. */
    private const EMPTY_FRAME_DURATION_MS = 1_000;

    public function renderFrames(Run $run, RenderConfig $config, string $outputDir): array
    {
        if (! is_dir($outputDir) && ! @mkdir($outputDir, 0755, true) && ! is_dir($outputDir)) {
            throw new RuntimeException("Failed to create output dir: {$outputDir}");
        }

        $log = $run->token_log ?? [];
        $lastTms = $this->lastTokenTms($log);
        $frameRate = max(1, $config->frameRate);
        $frameCount = max(1, (int) ceil(($lastTms / 1000) * $frameRate));
        $frameCount = min($frameCount, $config->maxFrames());

        $pngPaths = [];
        for ($i = 0; $i < $frameCount; $i++) {
            $frameTms = (int) round(($i * 1000) / $frameRate);
            $svg = $this->frameSvg($run, $log, $frameTms, $i + 1, $frameCount);

            $base = sprintf('frame-%05d', $i);
            $svgPath = $outputDir . DIRECTORY_SEPARATOR . $base . '.svg';
            $pngPath = $outputDir . DIRECTORY_SEPARATOR . $base . '.png';

            file_put_contents($svgPath, $svg);
            $this->rasterize($svgPath, $pngPath);
            // Drop intermediate SVG once rasterized — keeps the
            // tmp dir small and reduces filesystem chatter at
            // cleanup time. The PNG is the durable artifact.
            @unlink($svgPath);

            $pngPaths[] = $pngPath;
        }

        return $pngPaths;
    }

    /**
     * Walk token_log, return the largest t_ms (the natural end of
     * the run's wall-clock signal). Falls back to a fixed 1-second
     * frame for an empty log so we still produce a "static" GIF.
     *
     * @param  array<int, array{token?: string, t_ms?: int, logprobs?: mixed}>  $log
     */
    private function lastTokenTms(array $log): int
    {
        $max = 0;
        foreach ($log as $entry) {
            $tms = (int) ($entry['t_ms'] ?? 0);
            if ($tms > $max) {
                $max = $tms;
            }
        }
        if ($max <= 0) {
            return self::EMPTY_FRAME_DURATION_MS;
        }

        return $max;
    }

    /**
     * Shells out to `convert in.svg out.png` (ImageMagick CLI).
     * Uses Laravel's Process facade so tests can `Process::fake()`
     * the binary without needing it on the test runner.
     *
     * Command is built as a string (with `escapeshellarg` on the
     * paths) rather than the array form — Process::fake's pattern
     * matchers + assertions read the command as a string, and
     * passing a string skips a serialization step in
     * `Process::assertRanTimes` closures.
     */
    private function rasterize(string $svgPath, string $pngPath): void
    {
        $cmd = sprintf(
            'convert -density 96 -background none %s %s',
            escapeshellarg($svgPath),
            escapeshellarg($pngPath),
        );
        $result = Process::run($cmd);

        if (! $result->successful()) {
            throw new RuntimeException(sprintf(
                'convert failed (exit %d): %s',
                $result->exitCode() ?? -1,
                trim($result->errorOutput()),
            ));
        }
    }

    /**
     * Build a single frame's SVG string. Pure function of the
     * (run, log slice, t_ms) — deterministic across replays per
     * SPEC §10.1.
     *
     * @param  array<int, array{token?: string, t_ms?: int, logprobs?: mixed}>  $log
     */
    private function frameSvg(
        Run $run,
        array $log,
        int $frameTms,
        int $frameIndex,
        int $frameCount,
    ): string {
        $visible = $this->visibleEntries($log, $frameTms);

        // Header data.
        $modelSnap = $run->parameters['model_snapshot'] ?? [];
        $vendor = (string) ($modelSnap['vendor'] ?? '');
        $modelName = (string) ($modelSnap['name'] ?? $modelSnap['display_name'] ?? '');
        $arch = (string) ($modelSnap['architecture_type'] ?? 'dense');
        $isMoe = $arch === 'moe';

        // Body content.
        $liveText = $this->liveText($visible);
        $outputTokens = count($visible);
        $elapsedSec = $frameTms / 1000;
        $tps = $elapsedSec > 0 ? $outputTokens / $elapsedSec : 0.0;

        $latestLogprobs = $this->latestLogprobs($visible);
        $attentionRows = $this->attentionPanel($outputTokens, $arch, $modelSnap);
        $moePanel = $isMoe ? $this->moePanel($outputTokens) : '';

        $headerText = sprintf(
            'Run #%d · %s · %s',
            $run->id,
            $modelName !== '' ? $modelName : 'unknown model',
            $vendor !== '' ? $vendor : 'unknown vendor',
        );
        $headerRight = sprintf('%.1fs', $elapsedSec);

        $footer = sprintf('2D summary view · frame %d / %d', $frameIndex, $frameCount);

        return $this->composeSvg(
            headerLeft: $headerText,
            headerRight: $headerRight,
            liveText: $liveText,
            metricsLine: sprintf('%d out · %.1f t/s', $outputTokens, $tps),
            attentionRows: $attentionRows,
            logitsBars: $this->logitsBars($latestLogprobs),
            moePanel: $moePanel,
            footer: $footer,
        );
    }

    /**
     * @param  array<int, array{token?: string, t_ms?: int, logprobs?: mixed}>  $log
     * @return list<array{token: string, t_ms: int, logprobs: mixed}>
     */
    private function visibleEntries(array $log, int $frameTms): array
    {
        $visible = [];
        foreach ($log as $entry) {
            $tms = (int) ($entry['t_ms'] ?? 0);
            if ($tms <= $frameTms) {
                $visible[] = [
                    'token' => (string) ($entry['token'] ?? ''),
                    't_ms' => $tms,
                    'logprobs' => $entry['logprobs'] ?? null,
                ];
            }
        }

        return $visible;
    }

    /**
     * @param  list<array{token: string, t_ms: int, logprobs: mixed}>  $visible
     */
    private function liveText(array $visible): string
    {
        $text = '';
        foreach ($visible as $entry) {
            $text .= $entry['token'];
        }

        // Long lines: word-wrap at ~80 chars so the SVG doesn't
        // overflow the panel. Browsers don't word-wrap raw <text>.
        return wordwrap($text, 80, "\n", true);
    }

    /**
     * Top-K logprobs from the latest token_log entry that carries
     * them. Vendors that don't return logprobs → null.
     *
     * @param  list<array{token: string, t_ms: int, logprobs: mixed}>  $visible
     * @return list<array{token: string, prob: float}>|null
     */
    private function latestLogprobs(array $visible): ?array
    {
        for ($i = count($visible) - 1; $i >= 0; $i--) {
            $lp = $visible[$i]['logprobs'];
            if (! is_array($lp) || $lp === []) {
                continue;
            }
            // exp() + normalize to a probability distribution
            // across the top-K (matches the chunk-5b frontend
            // logits chart's per-K normalization).
            $probs = [];
            $sum = 0.0;
            foreach ($lp as $row) {
                if (! is_array($row) || ! isset($row['logprob'])) {
                    continue;
                }
                $p = exp((float) $row['logprob']);
                $probs[] = ['token' => (string) ($row['token'] ?? ''), 'prob' => $p];
                $sum += $p;
            }
            if ($sum <= 0 || $probs === []) {
                return null;
            }
            foreach ($probs as &$row) {
                $row['prob'] /= $sum;
            }
            usort($probs, fn ($a, $b) => $b['prob'] <=> $a['prob']);

            return array_slice($probs, 0, 10);
        }

        return null;
    }

    /**
     * Causal distance-decay attention pattern at the current
     * token count. Returns a 12x12 matrix downsampled from the
     * synthetic pattern — matches the chunk-5a heatmap visually.
     *
     * @return list<list<float>>
     */
    private function attentionPanel(int $tokens, string $arch, array $modelSnap): array
    {
        $cells = 12;
        if ($tokens <= 0) {
            return array_fill(0, $cells, array_fill(0, $cells, 0.0));
        }
        $n = min($tokens, $cells);
        $totalLayers = max(1, (int) ($modelSnap['layers'] ?? 12));
        // Mid-layer as the "representative" layer — a chosen
        // simplification for the 2D summary; real per-layer
        // selection lives in the M8 overlay.
        $layerIdx = (int) floor($totalLayers / 2);
        $decay = 2 + ($layerIdx / max(1, $totalLayers - 1)) * max(1, $n / 2);

        $matrix = [];
        for ($i = 0; $i < $cells; $i++) {
            $row = [];
            $rowSum = 0;
            for ($j = 0; $j < $cells; $j++) {
                if ($j > $i || $i >= $n || $j >= $n) {
                    $row[] = 0.0;
                } else {
                    $w = exp(-($i - $j) / $decay);
                    $row[] = $w;
                    $rowSum += $w;
                }
            }
            if ($rowSum > 0) {
                for ($j = 0; $j <= $i && $j < $cells; $j++) {
                    $row[$j] /= $rowSum;
                }
            }
            $matrix[] = $row;
        }

        return $matrix;
    }

    /**
     * Deterministic MoE state at the current token count, mirroring
     * the M8 chunk-6 visual: latest router scores + cumulative
     * utilization bars.
     *
     * @return string SVG fragment for the MoE panel.
     */
    private function moePanel(int $tokenCount): string
    {
        if ($tokenCount <= 0) {
            return '';
        }
        // Lifted from RunEventEmitter::expertsForToken's seed
        // (hash of (run_id, token_index)) so the panel matches a
        // live broadcast for the same run. Here we use a simpler
        // local hash since the SvgFrameRenderer doesn't know about
        // run_id at this point — the visual is a generic MoE
        // routing pattern. Real chunk-3 ffmpeg encoder will pass
        // the run_id down if we want byte-identical replay output.
        $latestIdx = $tokenCount - 1;
        $expertCount = 8;
        $activeCount = 2;
        $experts = [];
        for ($i = 0; $i < $activeCount; $i++) {
            $experts[] = ($latestIdx * 7 + $i * 3) % $expertCount;
        }
        $scores = [0.67, 0.33];

        $utilization = array_fill(0, $expertCount, 0);
        for ($t = 0; $t < $tokenCount; $t++) {
            for ($i = 0; $i < $activeCount; $i++) {
                $eid = ($t * 7 + $i * 3) % $expertCount;
                $utilization[$eid]++;
            }
        }

        return $this->moePanelSvg($experts, $scores, $utilization);
    }

    /**
     * @param  list<int>  $experts
     * @param  list<float>  $scores
     * @param  list<int>  $utilization
     */
    private function moePanelSvg(array $experts, array $scores, array $utilization): string
    {
        $bars = '';
        $maxUtil = max(1, max($utilization));
        $barWidth = 720 / count($utilization);
        for ($i = 0; $i < count($utilization); $i++) {
            $h = ($utilization[$i] / $maxUtil) * 40;
            $x = 480 + $i * $barWidth;
            $y = 670 - $h;
            $bars .= sprintf(
                '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#6366f1" opacity="0.7"/>',
                $x,
                $y,
                $barWidth - 2,
                $h,
            );
        }

        $latest = '';
        foreach ($experts as $i => $eid) {
            $pct = ($scores[$i] ?? 0) * 100;
            $latest .= sprintf(
                '<text x="40" y="%d" font-size="14" fill="#94a3b8">Expert %d: %.0f%%</text>',
                640 + $i * 18,
                $eid,
                $pct,
            );
        }

        return sprintf(
            '<text x="20" y="625" font-size="12" font-weight="bold" fill="#94a3b8">MoE ROUTING · 8 experts · top-2</text>%s%s',
            $latest,
            $bars,
        );
    }

    /**
     * @param  list<array{token: string, prob: float}>|null  $logprobs
     */
    private function logitsBars(?array $logprobs): string
    {
        if ($logprobs === null) {
            return '<text x="700" y="380" font-size="14" fill="#64748b">no logprobs available</text>';
        }
        $bars = '';
        $rowHeight = 18;
        foreach ($logprobs as $i => $row) {
            $pct = $row['prob'] * 100;
            $barWidth = max(2, $pct * 4);
            $y = 360 + $i * $rowHeight;
            $tokenLabel = $this->escape(json_encode($row['token']));
            $bars .= sprintf(
                '<text x="680" y="%d" font-size="12" fill="#94a3b8" font-family="monospace">%s</text>'
                . '<rect x="800" y="%d" width="%.1f" height="14" fill="#4f46e5" opacity="0.7"/>'
                . '<text x="%.1f" y="%d" font-size="11" fill="#cbd5e1">%.1f%%</text>',
                $y,
                $tokenLabel,
                $y - 10,
                $barWidth,
                805 + $barWidth,
                $y,
                $pct,
            );
        }

        return $bars;
    }

    /**
     * @param  list<list<float>>  $matrix
     */
    private function attentionSvg(array $matrix): string
    {
        $size = 12;
        $cellSize = 240 / $size;
        $originX = 40;
        $originY = 350;
        $cells = '';
        $maxVal = 0;
        foreach ($matrix as $row) {
            foreach ($row as $v) {
                if ($v > $maxVal) {
                    $maxVal = $v;
                }
            }
        }
        if ($maxVal <= 0) {
            $maxVal = 1.0;
        }
        for ($i = 0; $i < $size; $i++) {
            for ($j = 0; $j < $size; $j++) {
                $v = $matrix[$i][$j];
                if ($v <= 0) {
                    continue;
                }
                $intensity = (int) round(($v / $maxVal) * 200) + 30; // 30..230
                $x = $originX + $j * $cellSize;
                $y = $originY + $i * $cellSize;
                $cells .= sprintf(
                    '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="rgb(%d,%d,%d)"/>',
                    $x,
                    $y,
                    $cellSize,
                    $cellSize,
                    (int) ($intensity * 0.4),
                    (int) ($intensity * 0.9),
                    $intensity,
                );
            }
        }

        return sprintf(
            '<text x="40" y="335" font-size="12" font-weight="bold" fill="#94a3b8">ATTENTION (12×12, illustrative)</text>%s',
            $cells,
        );
    }

    private function composeSvg(
        string $headerLeft,
        string $headerRight,
        string $liveText,
        string $metricsLine,
        array $attentionRows,
        string $logitsBars,
        string $moePanel,
        string $footer,
    ): string {
        $w = self::WIDTH;
        $h = self::HEIGHT;

        // Live text — split on \n produced by wordwrap, render
        // each line as its own <text>.
        $lines = explode("\n", $liveText);
        $liveTextSvg = '';
        $lineY = 130;
        $maxLines = 6;
        foreach (array_slice($lines, 0, $maxLines) as $line) {
            $liveTextSvg .= sprintf(
                '<text x="40" y="%d" font-size="20" fill="#e2e8f0" font-family="ui-sans-serif">%s</text>',
                $lineY,
                $this->escape($line),
            );
            $lineY += 28;
        }
        // Blinking cursor — visualized as a thin rect; SVG itself
        // is rasterized so the actual blink doesn't matter for a
        // PNG sequence (the frames just show the cursor at end-of-
        // text, advancing with each new token).
        $liveTextSvg .= '<rect x="40" y="' . ($lineY - 18) . '" width="3" height="20" fill="#e2e8f0" opacity="0.8"/>';

        $attentionSvg = $this->attentionSvg($attentionRows);

        return <<<SVG
            <svg xmlns="http://www.w3.org/2000/svg" width="{$w}" height="{$h}" viewBox="0 0 {$w} {$h}" style="font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif">
                <rect width="{$w}" height="{$h}" fill="#020617"/>

                <!-- header -->
                <rect x="0" y="0" width="{$w}" height="60" fill="#0f172a"/>
                <text x="20" y="38" font-size="18" fill="#e2e8f0">{$this->escape($headerLeft)}</text>
                <text x="{$w}" y="38" font-size="18" fill="#94a3b8" text-anchor="end" dx="-20">{$this->escape($headerRight)}</text>

                <!-- live text panel -->
                <rect x="20" y="80" width="{$this->panelWidth(1)}" height="220" fill="#0f172a" rx="6"/>
                <text x="40" y="110" font-size="13" font-weight="bold" fill="#94a3b8">ASSISTANT</text>
                {$liveTextSvg}
                <text x="40" y="290" font-size="13" fill="#cbd5e1">{$this->escape($metricsLine)}</text>

                <!-- attention -->
                <rect x="20" y="320" width="{$this->panelWidth(2)}" height="280" fill="#0f172a" rx="6"/>
                {$attentionSvg}

                <!-- logits -->
                <rect x="{$this->panelX(2)}" y="320" width="{$this->panelWidth(2)}" height="280" fill="#0f172a" rx="6"/>
                <text x="680" y="335" font-size="12" font-weight="bold" fill="#94a3b8">LOGITS (top-K)</text>
                {$logitsBars}

                <!-- MoE strip (only when MoE) -->
                {$moePanel}

                <!-- footer -->
                <text x="{$w}" y="{$h}" font-size="12" fill="#475569" text-anchor="end" dx="-20" dy="-20">{$this->escape($footer)}</text>
            </svg>
            SVG;
    }

    private function panelWidth(int $whichOf2): int
    {
        return self::WIDTH - 40; // single-panel rows
    }

    private function panelX(int $whichOf2): int
    {
        return ($whichOf2 - 1) * (self::WIDTH / 2) + 20;
    }

    private function escape(?string $text): string
    {
        return htmlspecialchars($text ?? '', ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
}
