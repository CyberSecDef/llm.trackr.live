import { Link, useForm, usePage } from '@inertiajs/react';
import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { PageProps } from '@/types';
import UserAvatar from '@/Components/UserAvatar';
import RegistryStalenessBanner from '@/Components/RegistryStalenessBanner';
import { Button } from '@/Components/ui/button';
import { Separator } from '@/Components/ui/separator';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/Components/ui/sheet';
import { cn } from '@/lib/utils';

/*
 * AppLayout (M7 chunk 2).
 *
 * Desktop ≥ md: fixed sidebar (240px wide) + main content. Sub-md:
 * sidebar hidden, top bar shows a hamburger trigger that opens the
 * sidebar in a left-anchored Sheet. The same NAV_ITEMS list drives
 * both — single source of truth.
 *
 * `<title>` slot in the top bar accepts a string from the page; gets
 * the current location's nav label by default.
 *
 * Colors moved off hardcoded slate-* onto theme tokens (bg-background,
 * bg-card, border-border) so the app respects the .dark / :root vars
 * set in resources/css/app.css.
 */

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
    /**
     * Optional page title rendered in the top bar. Falls back to the
     * current nav item's label when omitted.
     */
    title?: ReactNode;
}

export default function AppLayout({ children, title }: Props) {
    const page = usePage<PageProps>();
    const { auth } = page.props;
    const currentUrl = page.url;
    const { post: postLogout, processing: loggingOut } = useForm({});
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    if (!auth.user) {
        // Render nothing — auth middleware should have already redirected.
        return null;
    }

    const items = NAV_ITEMS.filter((item) => !item.adminOnly || auth.user?.role === 'admin');
    const isActive = (href: string) => currentUrl === href || currentUrl.startsWith(`${href}/`);
    const derivedTitle = title ?? items.find((item) => isActive(item.href))?.label ?? '';

    const handleLogout = (e: React.FormEvent) => {
        e.preventDefault();
        postLogout(route('logout'));
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex">
            <aside
                aria-label="Primary navigation"
                className="hidden md:flex w-60 bg-card border-r border-border flex-col"
            >
                <SidebarBody
                    items={items}
                    isActive={isActive}
                    onNavigate={() => {
                        /* desktop sidebar stays open; no-op */
                    }}
                    user={auth.user}
                    onLogout={handleLogout}
                    loggingOut={loggingOut}
                />
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <header className="md:hidden flex items-center gap-3 border-b border-border bg-card px-4 py-3">
                    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Open navigation menu">
                                <Menu className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-72 p-0 bg-card">
                            <SheetHeader className="sr-only">
                                <SheetTitle>Primary navigation</SheetTitle>
                                <SheetDescription>
                                    Links to dashboard, threads, settings, and other top-level
                                    pages.
                                </SheetDescription>
                            </SheetHeader>
                            <SidebarBody
                                items={items}
                                isActive={isActive}
                                onNavigate={() => setMobileNavOpen(false)}
                                user={auth.user}
                                onLogout={handleLogout}
                                loggingOut={loggingOut}
                            />
                        </SheetContent>
                    </Sheet>
                    <h1
                        className="text-sm font-semibold truncate flex-1"
                        data-testid="topbar-title"
                    >
                        {derivedTitle || 'LLM-Viz'}
                    </h1>
                </header>
                <main className="flex-1 overflow-auto">
                    <RegistryStalenessBanner />
                    {children}
                </main>
            </div>
        </div>
    );
}

interface SidebarBodyProps {
    items: NavItem[];
    isActive: (href: string) => boolean;
    onNavigate: () => void;
    user: NonNullable<PageProps['auth']['user']>;
    onLogout: (e: React.FormEvent) => void;
    loggingOut: boolean;
}

function SidebarBody({
    items,
    isActive,
    onNavigate,
    user,
    onLogout,
    loggingOut,
}: SidebarBodyProps) {
    return (
        <div className="flex h-full flex-col">
            <div className="px-6 py-5">
                <Link
                    href="/dashboard"
                    className="text-lg font-bold tracking-tight"
                    onClick={onNavigate}
                >
                    LLM-Viz
                </Link>
            </div>
            <Separator />
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                {items.map((item) => (
                    <Link
                        key={item.routeName}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                            'block mx-2 px-4 py-2 rounded-md text-sm transition-colors',
                            isActive(item.href)
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                        )}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>
            <Separator />
            <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 px-2 py-2">
                    <UserAvatar user={user} size={32} />
                    <div className="min-w-0">
                        <p className="text-sm truncate">{user.name ?? user.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                </div>
                <form onSubmit={onLogout}>
                    <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        disabled={loggingOut}
                        className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                    >
                        Log out
                    </Button>
                </form>
            </div>
        </div>
    );
}
