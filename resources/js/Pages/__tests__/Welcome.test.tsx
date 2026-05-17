import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Welcome from '../Welcome';

describe('<Welcome />', () => {
    it('renders the app name', () => {
        render(<Welcome laravelVersion="13.9.0" phpVersion="8.4.21" />);
        expect(screen.getByText('LLM-Viz')).toBeInTheDocument();
    });

    it('displays the laravel and php versions passed as props', () => {
        render(<Welcome laravelVersion="13.9.0" phpVersion="8.4.21" />);
        expect(screen.getByText('Laravel 13.9.0')).toBeInTheDocument();
        expect(screen.getByText('PHP 8.4.21')).toBeInTheDocument();
    });

    it('links to the repository', () => {
        render(<Welcome laravelVersion="13.9.0" phpVersion="8.4.21" />);
        const link = screen.getByRole('link', { name: /the repository/i });
        expect(link).toHaveAttribute('href', 'https://github.com/CyberSecDef/llm.trackr.live');
    });
});
