import { Head, Link } from '@inertiajs/react';
import { ExternalLink, Eye, KeyRound, Share2, Sparkles } from 'lucide-react';

/*
 * /about (M11 chunk 4) — public landing for the "What is this?"
 * footer link on every /share/{token} page.
 *
 * No AppLayout / no sidebar: anonymous viewers (people who landed
 * on a share link and want context) shouldn't see the
 * authenticated chrome. Same minimal frame as SharedLayout.
 *
 * Covers four sections, in order:
 *   1. What LLM-Viz is.
 *   2. What a /share/{token} link gives you.
 *   3. Privacy posture (BYOK, opt-out prompt storage).
 *   4. AGPL §13 source link.
 *
 * The source link also appears in the footer so it's reachable
 * even if a viewer doesn't scroll.
 */

const REPO_URL = 'https://github.com/CyberSecDef/llm.trackr.live';

export default function About() {
    return (
        <>
            <Head title="About — llm.trackr.live" />
            <div className="min-h-screen bg-background text-foreground">
                <header
                    className="border-b border-border bg-card/40 px-6 py-3"
                    data-testid="about-header"
                >
                    <a
                        href="/"
                        className="text-sm font-medium tracking-tight text-foreground/90 hover:text-foreground"
                    >
                        llm.trackr.live
                    </a>
                </header>

                <main className="mx-auto max-w-2xl space-y-8 p-6 md:p-10">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight">
                            What is llm.trackr.live?
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Interactive, real-time visualization of LLM inference internals.
                        </p>
                    </div>

                    <Section
                        icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                        title="What it is"
                        testId="about-what"
                    >
                        <p>
                            LLM-Viz is a workspace for watching language models think. Send a prompt
                            to any supported model and the live token stream is overlaid with
                            per-token logits distributions, layer-by-layer activations, MoE expert
                            routing, and a 3D embedding view. Every run is saved and can be replayed
                            frame-identical to the original generation.
                        </p>
                    </Section>

                    <Section
                        icon={<Share2 className="h-4 w-4" aria-hidden="true" />}
                        title="What this share link is"
                        testId="about-share"
                    >
                        <p>
                            If you landed on a <code className="font-mono">/share/…</code> URL, the
                            author of a thread explicitly chose to make it public. The shared view
                            is read-only — you can read the conversation and replay any completed
                            run, but you can&apos;t send new prompts, edit, or see anything else in
                            the author&apos;s account.
                        </p>
                        <p>
                            Share links are rate-limited and can be turned off at any time by the
                            author. When that happens, the URL stops working immediately for
                            everyone.
                        </p>
                    </Section>

                    <Section
                        icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
                        title="Privacy posture"
                        testId="about-privacy"
                    >
                        <p>
                            llm.trackr.live is BYOK (&ldquo;bring your own key&rdquo;). Users add
                            their own API keys for whichever providers they want to use; we charge
                            nothing and run nothing on shared infrastructure on their behalf. Keys
                            are encrypted at rest with the application key and decrypted only at
                            inference time.
                        </p>
                        <p>
                            Users can opt out of prompt + conversation-history storage entirely.
                            When they do, only run metadata (token counts, latency, cost, the
                            visualization event log) is persisted — the prompt and assistant
                            response are dropped after the generation finishes. Shared threads with
                            this opt-out enabled show{' '}
                            <code className="font-mono">[prompt redacted by author]</code> in place
                            of the prompt text.
                        </p>
                    </Section>

                    <Section
                        icon={<Eye className="h-4 w-4" aria-hidden="true" />}
                        title="Open source"
                        testId="about-source"
                    >
                        <p>
                            llm.trackr.live is licensed under the GNU AGPL v3. Per AGPL §13 the full
                            source for the version running at this URL is available here:
                        </p>
                        <p>
                            <a
                                href={REPO_URL}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                data-testid="about-source-link"
                            >
                                {REPO_URL}
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                        </p>
                    </Section>

                    <div className="flex flex-wrap items-center gap-3 pt-4">
                        <Link
                            href="/login"
                            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                            data-testid="about-signin-cta"
                        >
                            Sign in to make your own
                        </Link>
                        <Link
                            href="/"
                            className="text-sm text-muted-foreground hover:text-foreground"
                            data-testid="about-home-link"
                        >
                            ← Back to home
                        </Link>
                    </div>
                </main>

                <footer
                    className="border-t border-border px-6 py-4 text-center text-[11px] text-muted-foreground"
                    data-testid="about-footer"
                >
                    <a
                        href={REPO_URL}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        data-testid="about-footer-source-link"
                    >
                        Source
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                </footer>
            </div>
        </>
    );
}

function Section({
    icon,
    title,
    testId,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    testId: string;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-2" data-testid={testId}>
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <span className="text-muted-foreground">{icon}</span>
                {title}
            </h2>
            <div className="space-y-2 text-sm leading-relaxed text-foreground/90">{children}</div>
        </section>
    );
}
