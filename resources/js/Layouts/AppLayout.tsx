import { Link, useForm, usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';
import UserAvatar from '@/Components/UserAvatar';
import RegistryStalenessBanner from '@/Components/RegistryStalenessBanner';
import type { ReactNode } from 'react';

interface NavItem {
    label: string;
    href: string;
    routeName: string;
    adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', routeName: 'dashboard' },
    { label: 'Threads', href: '/threads', routeName: 'threads.index' },
    { label: 'Models', href: '/models', routeName: 'models.index' },
    { label: 'API Keys', href: '/api-keys', routeName: 'api-keys.index' },
    { label: 'Settings', href: '/settings', routeName: 'settings' },
    {
        label: 'Admin · Users',
        href: '/admin/users',
        routeName: 'admin.users.index',
        adminOnly: true,
    },
    {
        label: 'Admin · Models',
        href: '/admin/models',
        routeName: 'admin.models.index',
        adminOnly: true,
    },
];

interface Props {
    children: ReactNode;
}

export default function AppLayout({ children }: Props) {
    const page = usePage<PageProps>();
    const { auth } = page.props;
    const currentUrl = page.url;
    const { post: postLogout, processing: loggingOut } = useForm({});

    if (!auth.user) {
        // Render nothing — auth middleware should have already redirected.
        return null;
    }

    const items = NAV_ITEMS.filter((item) => !item.adminOnly || auth.user?.role === 'admin');

    const handleLogout = (e: React.FormEvent) => {
        e.preventDefault();
        postLogout(route('logout'));
    };

    const isActive = (href: string) => currentUrl === href || currentUrl.startsWith(`${href}/`);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex">
            <aside
                aria-label="Primary navigation"
                className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col"
            >
                <div className="px-6 py-5 border-b border-slate-800">
                    <Link href="/dashboard" className="text-lg font-bold tracking-tight">
                        LLM-Viz
                    </Link>
                </div>
                <nav className="flex-1 py-4 space-y-1">
                    {items.map((item) => (
                        <Link
                            key={item.routeName}
                            href={item.href}
                            className={`block mx-2 px-4 py-2 rounded text-sm transition-colors ${
                                isActive(item.href)
                                    ? 'bg-slate-800 text-slate-100'
                                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                            }`}
                            aria-current={isActive(item.href) ? 'page' : undefined}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
                <div className="border-t border-slate-800 p-3 space-y-2">
                    <div className="flex items-center gap-2 px-2 py-2">
                        <UserAvatar user={auth.user} size={32} />
                        <div className="min-w-0">
                            <p className="text-sm truncate">{auth.user.name ?? auth.user.email}</p>
                            <p className="text-xs text-slate-500 truncate">{auth.user.email}</p>
                        </div>
                    </div>
                    <form onSubmit={handleLogout}>
                        <button
                            type="submit"
                            disabled={loggingOut}
                            className="w-full px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded text-left disabled:opacity-50"
                        >
                            Log out
                        </button>
                    </form>
                </div>
            </aside>
            <main className="flex-1 overflow-auto">
                <RegistryStalenessBanner />
                {children}
            </main>
        </div>
    );
}
