import { ShieldAlert } from 'lucide-react';
import ErrorShell from './ErrorShell';

export default function Forbidden() {
    return (
        <ErrorShell
            status={403}
            headline="Forbidden"
            message="Your account doesn't have permission to view this resource."
            icon={<ShieldAlert className="h-12 w-12" aria-hidden="true" />}
        />
    );
}
