/// <reference types="vite/client" />

import type { AxiosInstance } from 'axios';
import type { route as ziggyRoute } from 'ziggy-js';

declare global {
    interface ImportMetaEnv {
        readonly VITE_APP_NAME?: string;
        readonly VITE_SENTRY_DSN?: string;
        readonly VITE_SENTRY_ENVIRONMENT?: string;
        readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
        readonly VITE_PUSHER_APP_KEY?: string;
        readonly VITE_PUSHER_HOST?: string;
        readonly VITE_PUSHER_PORT?: string;
        readonly VITE_PUSHER_SCHEME?: string;
        readonly VITE_PUSHER_APP_CLUSTER?: string;
    }

    interface ImportMeta {
        readonly env: ImportMetaEnv;
    }

    interface Window {
        axios?: AxiosInstance;
    }

    // Ziggy's @routes blade directive exposes route() globally.
    const route: typeof ziggyRoute;
}

export {};
