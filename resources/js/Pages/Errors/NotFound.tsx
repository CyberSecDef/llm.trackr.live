import ErrorShell from './ErrorShell';

export default function NotFound() {
    return (
        <ErrorShell
            status={404}
            headline="Page not found"
            message="The page you were looking for either doesn't exist or you don't have access to it."
        />
    );
}
