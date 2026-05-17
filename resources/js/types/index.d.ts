import type { Config } from 'ziggy-js';

export type UserRole = 'user' | 'admin';

export interface User {
    id: number;
    name: string | null;
    email: string;
    avatar_url: string | null;
    role: UserRole;
}

export type PageProps<T extends Record<string, unknown> = Record<string, unknown>> = T & {
    auth: {
        user: User | null;
    };
    ziggy: Config & { location: string };
};
