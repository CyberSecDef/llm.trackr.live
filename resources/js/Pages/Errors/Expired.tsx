import { Clock } from 'lucide-react';
import ErrorShell from './ErrorShell';

export default function Expired() {
    return (
        <ErrorShell
            status={419}
            headline="Session expired"
            message="Your session timed out for security. Sign in again to continue."
            icon={<Clock className="h-12 w-12" aria-hidden="true" />}
        />
    );
}
