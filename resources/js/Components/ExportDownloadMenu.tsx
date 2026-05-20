import { AlertCircle, ChevronDown, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';
import { useExportTrigger } from '@/hooks/useExportTrigger';
import { cn } from '@/lib/utils';

/*
 * ExportDownloadMenu (M10 chunk 5b) — single chooser button for
 * all export formats on a run.
 *
 * Three menu items: JSON (instant, the chunk-3 M9 endpoint), GIF
 * (dispatches the chunk-5a trigger endpoint + waits for the
 * WebSocket completion), MP4 (same flow, just a different file).
 *
 * GIF/MP4 items share a single `useExportTrigger` instance — once
 * the user clicks either, the render starts and BOTH download
 * links light up together (chunk-2/3 produces them in the same
 * pass). Subsequent clicks while rendering are no-ops; menu items
 * show a spinner during 'rendering' and an error chip when the
 * job fails.
 */

interface ExportDownloadMenuProps {
    runId: number;
    /** Pre-rendered hrefs for the link items; matches the M9 endpoints. */
    jsonHref: string;
    /** Optional className for the trigger button. */
    triggerClassName?: string;
    /** Compact size: small pill (transcript rows). Default: button-sized. */
    size?: 'pill' | 'button';
}

export default function ExportDownloadMenu({
    runId,
    jsonHref,
    triggerClassName,
    size = 'button',
}: ExportDownloadMenuProps) {
    const [open, setOpen] = useState(false);
    const exportTrigger = useExportTrigger(runId);

    const handleVideoClick = async () => {
        if (exportTrigger.state === 'ready' || exportTrigger.state === 'rendering') {
            // 'ready': the anchor handles the click; we don't
            // re-trigger. 'rendering': no-op until the broadcast.
            return;
        }
        await exportTrigger.trigger();
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        size === 'pill'
                            ? 'inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                            : 'inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground',
                        triggerClassName,
                    )}
                    data-testid="export-menu-trigger"
                    aria-label="Download menu"
                >
                    <Download className="h-3 w-3" aria-hidden="true" />
                    Download
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1" data-testid="export-menu-content">
                {/* JSON — instant, just a link */}
                <a
                    href={jsonHref}
                    download
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                    data-testid="export-menu-json"
                >
                    <Download className="h-3 w-3" aria-hidden="true" />
                    <span className="flex-1">JSON</span>
                    <span className="text-[10px] text-muted-foreground">.json</span>
                </a>

                {/* GIF + MP4 share the trigger state */}
                <MenuItem
                    label="Animated GIF"
                    extension=".gif"
                    state={exportTrigger.state}
                    href={exportTrigger.gifUrl}
                    onClick={handleVideoClick}
                    testId="export-menu-gif"
                />
                <MenuItem
                    label="MP4 video"
                    extension=".mp4"
                    state={exportTrigger.state}
                    href={exportTrigger.mp4Url}
                    onClick={handleVideoClick}
                    testId="export-menu-mp4"
                />

                {exportTrigger.state === 'error' && exportTrigger.error && (
                    <div
                        className="mt-1 flex items-start gap-1 rounded bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive"
                        data-testid="export-menu-error"
                    >
                        <AlertCircle className="mt-px h-3 w-3 flex-shrink-0" aria-hidden="true" />
                        <span>{exportTrigger.error}</span>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

function MenuItem({
    label,
    extension,
    state,
    href,
    onClick,
    testId,
}: {
    label: string;
    extension: string;
    state: ReturnType<typeof useExportTrigger>['state'];
    href: string | null;
    onClick: () => void;
    testId: string;
}) {
    const isRendering = state === 'rendering';
    const isReady = state === 'ready' && href !== null;

    if (isReady && href !== null) {
        return (
            <a
                href={href}
                download
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                data-testid={testId}
            >
                <Download className="h-3 w-3" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                <span className="text-[10px] text-muted-foreground">{extension}</span>
            </a>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={isRendering}
            className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground',
                isRendering && 'cursor-not-allowed opacity-60',
            )}
            data-testid={testId}
        >
            {isRendering ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
                <Download className="h-3 w-3" aria-hidden="true" />
            )}
            <span className="flex-1 text-left">
                {label}
                {isRendering && <span className="ml-1 text-muted-foreground">(rendering…)</span>}
            </span>
            <span className="text-[10px] text-muted-foreground">{extension}</span>
        </button>
    );
}
