import ErrorShell from './ErrorShell';

export default function ServerError() {
    return (
        <ErrorShell
            status={500}
            headline="Something went wrong"
            message="An unexpected error occurred on our end. The error has been logged; try again in a moment."
        />
    );
}
