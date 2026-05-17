/// <reference types="vite/client" />

import type { AxiosInstance } from 'axios';
import type { route as ziggyRoute } from 'ziggy-js';

declare global {
    interface Window {
        axios?: AxiosInstance;
    }

    // Ziggy's @routes blade directive exposes route() globally.
    const route: typeof ziggyRoute;
}

export {};
