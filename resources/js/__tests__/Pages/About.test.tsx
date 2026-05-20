import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import About from '@/Pages/About';

describe('<About />', () => {
    it('renders the headline', () => {
        render(<About />);
        expect(
            screen.getByRole('heading', { level: 1, name: /what is llm\.trackr\.live/i }),
        ).toBeInTheDocument();
    });

    it('explains what LLM-Viz is', () => {
        render(<About />);
        expect(screen.getByTestId('about-what')).toBeInTheDocument();
    });

    it('explains what a /share/ link means', () => {
        render(<About />);
        expect(screen.getByTestId('about-share')).toBeInTheDocument();
        expect(screen.getByTestId('about-share')).toHaveTextContent(/read-only/i);
    });

    it('describes the privacy posture (BYOK + opt-out prompt storage)', () => {
        render(<About />);
        const section = screen.getByTestId('about-privacy');
        expect(section).toHaveTextContent(/BYOK/);
        expect(section).toHaveTextContent(/opt out/i);
    });

    it('surfaces the AGPL §13 source link in the body', () => {
        render(<About />);
        const link = screen.getByTestId('about-source-link');
        expect(link).toHaveAttribute('href', 'https://github.com/CyberSecDef/llm.trackr.live');
    });

    it('surfaces the AGPL §13 source link in the footer', () => {
        render(<About />);
        const link = screen.getByTestId('about-footer-source-link');
        expect(link).toHaveAttribute('href', 'https://github.com/CyberSecDef/llm.trackr.live');
    });

    it('has a sign-in CTA pointing at /login', () => {
        render(<About />);
        const cta = screen.getByTestId('about-signin-cta');
        expect(cta).toHaveAttribute('href', '/login');
    });

    it('has a back-to-home link', () => {
        render(<About />);
        const back = screen.getByTestId('about-home-link');
        expect(back).toHaveAttribute('href', '/');
    });
});
