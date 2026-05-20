import { router } from '@inertiajs/react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';
import { cn } from '@/lib/utils';

/*
 * ShareMenu (M11 chunk 3) — popover trigger in the thread
 * header that lets the owner enable/disable public sharing.
 *
 * State surface:
 *   - share_token === null → "Enable sharing" button (POST).
 *   - share_token !== null → URL + Copy + "Disable" button
 *     (DELETE).
 *
 * Per chunk-1 decision: POST always regenerates the token so a
 * disable→re-enable cycle invalidates the old URL. The
 * "Disable" button uses a single-click DELETE (no confirm
 * dialog) per chunk-3 decision — re-enabling is one click away
 * if the user changes their mind, just with a fresh token.
 *
 * Copy state: 2-second "Copied!" flash after a successful
 * navigator.clipboard.writeText. Trigger button label stays
 * "Share" regardless of state — visual state lives inside the
 * popover content.
 */

interface ShareMenuProps {
    threadId: number;
    shareToken: string | null;
    shareEnabledAt: string | null;
    /** Full origin (e.g. "https://llm.trackr.live") so the URL
     *  surfaces to the user as a real shareable string, not just
     *  a relative path. */
    origin: string;
}

export default function ShareMenu({
    threadId,
    shareToken,
    shareEnabledAt,
    origin,
}: ShareMenuProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const enabled = shareToken !== null;
    const shareUrl = shareToken ? `${origin}/share/${shareToken}` : '';

    const handleEnable = () => {
        router.post(
            `/threads/${threadId}/share`,
            {},
            {
                preserveScroll: true,
                onSuccess: () => {
                    // Inertia reloads thread props; share_token gets
                    // populated. Popover stays open so the URL pops
                    // into view.
                },
            },
        );
    };

    const handleDisable = () => {
        router.delete(`/threads/${threadId}/share`, {
            preserveScroll: true,
        });
    };

    const handleCopy = async () => {
        if (!shareToken) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // navigator.clipboard might be unavailable in non-HTTPS
            // dev contexts. Fall back to a visible textarea so the
            // user can manually copy.

            window.prompt('Copy the share URL:', shareUrl);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    data-testid="share-menu-trigger"
                    aria-label={enabled ? 'Manage sharing' : 'Enable sharing'}
                >
                    <Share2 className="mr-1 h-3 w-3" aria-hidden="true" />
                    Share
                    {enabled && (
                        <span
                            className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                            data-testid="share-menu-on-indicator"
                            aria-label="Sharing is on"
                        />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-80 space-y-3 p-3"
                data-testid="share-menu-content"
            >
                {enabled ? (
                    <>
                        <div className="space-y-1">
                            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Sharing is ON
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Anyone with this link can read the thread + replay its runs.
                                Disabling will dead-link the URL.
                                {shareEnabledAt && (
                                    <span className="ml-1">
                                        Enabled at {new Date(shareEnabledAt).toLocaleString()}.
                                    </span>
                                )}
                            </p>
                        </div>

                        <div className="flex items-center gap-1">
                            <Link2
                                className="h-3 w-3 flex-shrink-0 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                readOnly
                                value={shareUrl}
                                className="h-7 text-[11px] font-mono"
                                data-testid="share-menu-url"
                                onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleCopy}
                                className="h-7 px-2"
                                data-testid="share-menu-copy"
                                aria-label="Copy share URL"
                            >
                                {copied ? (
                                    <Check
                                        className="h-3 w-3 text-emerald-400"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Copy className="h-3 w-3" aria-hidden="true" />
                                )}
                            </Button>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleDisable}
                            className={cn('w-full text-destructive hover:text-destructive')}
                            data-testid="share-menu-disable"
                        >
                            Disable sharing
                        </Button>
                    </>
                ) : (
                    <>
                        <div className="space-y-1">
                            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Sharing is OFF
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Enable to generate a read-only public link that anyone can open. The
                                link is rate-limited and stops working when you disable sharing.
                            </p>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleEnable}
                            className="w-full"
                            data-testid="share-menu-enable"
                        >
                            <Share2 className="mr-1 h-3 w-3" aria-hidden="true" />
                            Enable sharing
                        </Button>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
