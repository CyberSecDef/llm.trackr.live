import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

/*
 * Laravel Echo + pusher-js (Reverb-compatible) bootstrap (M6 chunk 4b).
 *
 * Reverb speaks the pusher-protocol over WebSocket, so we use pusher-js
 * as the transport. Channel-auth signing happens on the server via the
 * /broadcasting/auth endpoint (wired in chunk 4a); pusher-js POSTs the
 * channel_name + socket_id there as part of every private-channel
 * subscription.
 *
 * Hung off `window.Echo` so any component can `window.Echo.private(...)`
 * without prop drilling. Vitest tests stub `window.Echo` directly so
 * useRunStream stays testable in isolation without a real WebSocket.
 *
 * Init is conditional on VITE_REVERB_APP_KEY being present — that way
 * environments without Reverb config (CI, certain previews) don't bomb
 * the bundle on load. Anything that needs Echo at runtime can probe
 * `window.Echo` for null.
 */

declare global {
    interface Window {
        Pusher: typeof Pusher;
        Echo: Echo<'reverb'> | null;
    }
}

const reverbKey = import.meta.env.VITE_REVERB_APP_KEY;

if (reverbKey) {
    window.Pusher = Pusher;
    window.Echo = new Echo({
        broadcaster: 'reverb',
        key: reverbKey,
        wsHost: import.meta.env.VITE_REVERB_HOST,
        wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
        wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
        forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'http') === 'https',
        enabledTransports: ['ws', 'wss'],
    });
} else {
    window.Echo = null;
}
