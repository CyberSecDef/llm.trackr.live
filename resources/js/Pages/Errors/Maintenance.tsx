import { Wrench } from 'lucide-react';
import ErrorShell from './ErrorShell';

/*
 * 503 Service Unavailable (M12 chunk 7).
 *
 * Distinct from 500 — 503 means the service is intentionally down
 * (deploy in progress, scheduled maintenance, overload-shedding).
 * The messaging is "we'll be right back" rather than "we logged
 * an error" because there's nothing the user can do to retry sooner
 * and the situation is expected to clear on its own.
 */

export default function Maintenance() {
    return (
        <ErrorShell
            status={503}
            headline="We'll be right back"
            message="The app is temporarily unavailable for maintenance. Try again in a few minutes."
            icon={<Wrench className="h-12 w-12" aria-hidden="true" />}
        />
    );
}
