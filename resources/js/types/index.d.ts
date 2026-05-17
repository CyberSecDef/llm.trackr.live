import type { Config } from 'ziggy-js';

export interface User {
    id: number;
    name: string;
    email: string;
}

export type PageProps<T extends Record<string, unknown> = Record<string, unknown>> = T & {
    auth: {
        user: User | null;
    };
    ziggy: Config & { location: string };
};
