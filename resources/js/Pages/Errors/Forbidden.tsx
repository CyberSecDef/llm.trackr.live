import ErrorShell from './ErrorShell';

export default function Forbidden() {
    return (
        <ErrorShell
            status={403}
            headline="Forbidden"
            message="Your account doesn't have permission to view this resource."
        />
    );
}
