import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import { toast } from '@/Components/ui/sonner';
import type { PageProps } from '@/types';

/*
 * useFlashToast (M12 chunk 6) — watches Laravel session flash on the
 * Inertia page props and translates known statuses into Sonner
 * toasts. Replaces the inline alert blocks the M3-M7 chunks were
 * rendering inside each page.
 *
 * Why a hook + central registry instead of per-page toast()
 * calls in the controllers' redirect handlers:
 *   - The flash is delivered as a prop, not an event — pages would
 *     otherwise have to wire their own useEffect each. A single
 *     hook in AppLayout's tree is the DRY shape.
 *   - Mapping known status strings → toast variants keeps the
 *     vocabulary discoverable: a contributor reading this file
 *     learns what flash statuses the app uses.
 *
 * Status format:
 *   - Plain string: `api-key-added`, `settings-saved`
 *   - With payload: `api-key-deleted:{vendor}`, `model-updated:{name}`
 *
 * Unknown statuses are silently ignored — the controller path that
 * sets them either landed before this hook (graceful degradation)
 * or is a new flow we haven't added a handler for yet.
 */

type FlashStatus = string;

interface FlashShape {
    status?: FlashStatus;
}

function lastSegment(status: string, prefix: string): string {
    return status.replace(prefix, '');
}

function statusToToast(status: FlashStatus): boolean {
    if (status === 'settings-saved') {
        toast.success('Settings saved.');
        return true;
    }
    if (status === 'api-key-added') {
        toast.success('API key added.');
        return true;
    }
    if (status.startsWith('api-key-deleted:')) {
        toast.info(`Deleted ${lastSegment(status, 'api-key-deleted:')} key.`);
        return true;
    }
    if (status.startsWith('refresh-complete:')) {
        toast.success(`Registry refreshed — ${lastSegment(status, 'refresh-complete:')}`);
        return true;
    }
    if (status.startsWith('model-updated:')) {
        toast.success(`Updated ${lastSegment(status, 'model-updated:')}.`);
        return true;
    }
    if (status.startsWith('model-deleted:')) {
        toast.info(`Deleted ${lastSegment(status, 'model-deleted:')}.`);
        return true;
    }
    if (status.startsWith('rate-limit-updated:')) {
        toast.success('Rate limit updated.');
        return true;
    }
    return false;
}

export function useFlashToast(): void {
    const page = usePage<PageProps & { flash?: FlashShape }>();
    const lastFiredRef = useRef<FlashStatus | null>(null);

    useEffect(() => {
        const status = page.props.flash?.status;
        if (!status) return;
        // Inertia keeps the same flash prop across re-renders until
        // the next visit clears it. Guard against firing the same
        // toast twice when an unrelated prop changes.
        if (lastFiredRef.current === status) return;
        if (statusToToast(status)) {
            lastFiredRef.current = status;
        }
    }, [page.props.flash?.status]);
}
