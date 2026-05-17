import type { User } from '@/types';

interface Props {
    user: User;
    size?: number;
}

function initialsFor(user: User): string {
    const source = user.name ?? user.email;
    return source.charAt(0).toUpperCase();
}

export default function UserAvatar({ user, size = 32 }: Props) {
    if (user.avatar_url) {
        return (
            <img
                src={user.avatar_url}
                alt={user.name ?? user.email}
                width={size}
                height={size}
                className="rounded-full object-cover"
            />
        );
    }

    return (
        <div
            aria-label={user.name ?? user.email}
            style={{ width: size, height: size }}
            className="rounded-full bg-indigo-700 text-slate-100 grid place-items-center text-sm font-semibold select-none"
        >
            {initialsFor(user)}
        </div>
    );
}
