import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Login from '@/Pages/Login';

describe('<Login />', () => {
    it('renders three provider buttons', () => {
        render(<Login />);
        expect(screen.getByRole('link', { name: /continue with google/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /continue with microsoft/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /continue with facebook/i })).toBeInTheDocument();
    });

    it('points each provider link at the auth.redirect route', () => {
        render(<Login />);
        const google = screen.getByRole('link', { name: /continue with google/i });
        // Our test setup stubs route() to /_test/{name} regardless of params.
        expect(google.getAttribute('href')).toContain('/_test/auth.redirect');
    });

    it('renders a back-to-home link', () => {
        render(<Login />);
        const back = screen.getByRole('link', { name: /back to home/i });
        expect(back).toHaveAttribute('href', '/_test/home');
    });

    it('renders no error banner when there are no errors', () => {
        render(<Login />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
