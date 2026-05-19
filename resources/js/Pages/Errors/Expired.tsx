import ErrorShell from './ErrorShell';

export default function Expired() {
    return (
        <ErrorShell
            status={419}
            headline="Session expired"
            message="Your session timed out for security. Sign in again to continue."
        />
    );
}
