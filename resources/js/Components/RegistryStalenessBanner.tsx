import { Link, router, usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';

interface RegistryState {
    is_stale: boolean;
    days_stale: number | null;
    last_refresh_at: string | null;
}

export default function RegistryStalenessBanner() {
    const { auth, registry } = usePage<PageProps & { registry?: RegistryState }>().props;

    if (!registry?.is_stale) {
        return null;
    }

    const isAdmin = auth.user?.role === 'admin';
    const daysText =
        registry.days_stale === null
            ? 'has never been populated'
            : `is ${registry.days_stale} day${registry.days_stale === 1 ? '' : 's'} stale`;

    const handleRefresh = () => {
        router.post(route('admin.models.refresh'));
    };

    return (
        <div
            role="status"
            aria-live="polite"
            className="bg-amber-950/40 border-b border-amber-900/60 text-amber-200 px-6 py-2 text-xs flex flex-wrap items-center gap-3"
        >
            <span className="font-medium">Model registry {daysText}.</span>
            {registry.days_stale !== null && (
                <span className="text-amber-300/70">
                    Pricing and capability data may be out of date.
                </span>
            )}

            {isAdmin ? (
                <span className="ml-auto flex items-center gap-3">
                    <Link
                        href={route('admin.models.index')}
                        className="underline hover:text-amber-100"
                    >
                        View registry
                    </Link>
                    <button
                        type="button"
                        onClick={handleRefresh}
                        className="px-2 py-0.5 bg-amber-800/60 hover:bg-amber-700/60 rounded border border-amber-700"
                    >
                        Refresh now
                    </button>
                </span>
            ) : (
                <span className="ml-auto text-amber-300/80">
                    Ask an admin to run the registry refresh.
                </span>
            )}
        </div>
    );
}
