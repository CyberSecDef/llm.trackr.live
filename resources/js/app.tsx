import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';

const appName = import.meta.env.VITE_APP_NAME || 'LLM-Viz';
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

// Sentry only initializes when a DSN is provided. Blank DSN = no SDK calls,
// no network traffic, no overhead — local dev stays quiet.
if (sentryDsn) {
    Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'local',
        tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0,
        integrations: [Sentry.browserTracingIntegration()],
    });
}

function ErrorFallback() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
                <h1 className="text-2xl font-bold">Something went wrong.</h1>
                <p className="text-slate-400 text-sm">
                    The error has been reported. Try reloading the page.
                </p>
            </div>
        </div>
    );
}

createInertiaApp({
    title: (title) => (title ? `${title} — ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(`./Pages/${name}.tsx`, import.meta.glob('./Pages/**/*.tsx')),
    setup({ el, App, props }) {
        createRoot(el).render(
            <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
                <App {...props} />
            </Sentry.ErrorBoundary>,
        );
    },
    progress: {
        color: '#4f46e5',
    },
});
