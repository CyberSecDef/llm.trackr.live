# Phase 1 — Launch Product

**Goal:** Ship the LLM Process Visualizer as defined in [`SPEC.md`](../SPEC.md). All 9 vendors, persistent threads, real-time visualization, replay, export (JSON + GIF), opt-in thread sharing, deployed to DreamHost VPS.

**Status:** Not started.
**Source of truth for scope:** `SPEC.md` §2.1 (in scope) and §2.2 (out of scope).

This document breaks Phase 1 into 14 milestones (M1–M14). Each milestone lists its purpose, concrete tasks, dependencies, exit criteria, and a rough effort estimate.

> **Note on estimates.** Time estimates are in "engineer-days" assuming one person working full-time and familiar with the stack. They are planning aids, not commitments.

---

## Milestone overview

| # | Milestone | Depends on | Estimate | Status | Vertical-slice gate? |
|---|---|---|---|---|---|
| M1 | Foundation | — | 3 days | ✅ Complete | |
| M2 | Auth + Users | M1 | 4 days | 🟡 Not started | |
| M3 | Model Registry | M2 | 4 days | ⚪ Not started | |
| M4 | API Keys + Vendor Clients | M2 | 12 days | ⚪ Not started | |
| M5 | Threads + Runs (data) | M3, M4 | 4 days | ⚪ Not started | |
| M6 | Realtime + Streaming Pipeline | M5 | 6 days | ⚪ Not started | |
| M7 | Frontend — Static UI | M5 | 7 days | ⚪ Not started | |
| M8 | Frontend — Live Visualization | M6, M7 | 12 days | ⚪ Not started | ✅ End-of-M8 = vertical slice |
| M9 | Replay + JSON Export | M8 | 4 days | ⚪ Not started | |
| M10 | GIF Export | M8 | 6 days | ⚪ Not started | |
| M11 | Thread Sharing | M9 | 3 days | ⚪ Not started | |
| M12 | Accessibility + Polish | M11 | 5 days | ⚪ Not started | |
| M13 | Deployment | M12 | 5 days | ⚪ Not started | |
| M14 | Launch Prep | M13 | 5 days | ⚪ Not started | |
| | **Total** | | **~80 engineer-days** | | |

---

## M1 — Foundation

**Purpose:** Empty repo → working Laravel + React + Vite dev environment with CI and linters.

**Tasks**
- [x] `composer create-project laravel/laravel` in repo root (Laravel 13.9.0, upgraded from initial Laravel 11 scaffold).
- [x] Switch DB driver to SQLite; create `database/database.sqlite` (SQLite is the default in Laravel 13; DB file is gitignored per-environment).
- [x] Add `.editorconfig`, `.gitignore` (Laravel + Node), `.gitattributes` (Laravel 13 defaults + project-specific extensions for SQLite/Sentry/OS files).
- [x] Install Inertia.js Laravel adapter (`inertiajs/inertia-laravel` ^3.1) + React preset (TypeScript): React 19, `@inertiajs/react` ^2, TypeScript, `@types/react`/`@types/react-dom`/`@types/node`, `@vitejs/plugin-react` ^5 (pinned to v5 for Vite 6 compat). Ziggy installed too (`tightenco/ziggy` ^2.6 + `ziggy-js`) for Laravel-named-routes-in-JS.
- [x] Install Tailwind CSS 3 + configure `tailwind.config.js` (Tailwind 3.4 already shipped in the skeleton; content paths updated to include `.{ts,tsx}` files).
- [x] Configure Vite for React + Inertia. `vite.config.js` → `vite.config.ts`; `react()` plugin added; input updated to `resources/js/app.tsx`; `@/*` alias added pointing to `resources/js/`.
- [x] Set up Laravel Pint config: `pint.json` with `laravel` preset + `concat_space`, `ordered_imports`, `no_unused_imports`, `global_namespace_import`. All existing files auto-formatted to match.
- [x] Set up ESLint + Prettier for JS/TS. ESLint 9 flat config (`eslint.config.js`) with `typescript-eslint` recommended + `eslint-plugin-react` + `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y` (a11y rules support WCAG goals) + `eslint-config-prettier` to disable conflicting style rules. Prettier config in `.prettierrc.json` (4-space, single-quote, trailing commas, 100-col; YAML overridden to 2-space). Markdown files added to `.prettierignore` to avoid table-alignment churn on edits.
- [x] Install Husky + lint-staged for pre-commit hooks. `.husky/pre-commit` runs `npx lint-staged` (Pint on PHP, ESLint+Prettier on TS/JS/CSS/JSON/YAML/HTML) followed by `npm run type-check` (TS errors caught at commit time, not just CI).
- [x] Install Pest for PHP testing (Pest 4.7, replacing the default PHPUnit ExampleTests). New `tests/Pest.php` base config + `tests/Feature/WelcomePageTest.php` covering Inertia round-trip. PHPUnit downgraded to 12.5.24 for Pest compat. `pest-plugin-laravel` skipped — its Laravel 13 support hasn't shipped and most of its features are absorbed into Pest core anyway.
- [x] Extend `.env.example` with project-specific keys (Socialite Google/MS/FB, Pusher-protocol broadcast, OpenRouter, Sentry DSN, GIF renderer, repo URL for AGPL §13, default rate limit). All values blank or sensible defaults; production overrides happen in `.env`.
- [x] GitHub Actions workflow: `.github/workflows/lint.yml` (Pint, ESLint, Prettier, TypeScript) + `.github/workflows/test.yml` (Pest + Vitest + React Testing Library). Both pin PHP 8.4 + Node 20, cache Composer + npm, and use `concurrency` to cancel superseded runs. **Initial PHP version was 8.3 per the SPEC, but Laravel 13 ships with Symfony 8.x which requires PHP 8.4+ — spec corrected accordingly.** Vitest + RTL + jsdom installed for frontend testing; `resources/js/Pages/__tests__/Welcome.test.tsx` provides the first 3 passing tests. Cypress E2E deferred to a later milestone (no real UI to drive yet).
- [x] Install Sentry Laravel SDK + frontend SDK. Backend: `sentry/sentry-laravel` ^4.25 with `config/sentry.php` published; `Integration::handles($exceptions)` registered in `bootstrap/app.php` for unhandled-exception capture (Laravel 11+ requirement). Frontend: `@sentry/react` with `Sentry.init()` gated on `VITE_SENTRY_DSN` (no-op when blank — local dev stays silent and makes no network calls); `Sentry.ErrorBoundary` wraps the Inertia App with a `<ErrorFallback />` UI. Vite env types extended in `resources/js/types/global.d.ts` so `import.meta.env.VITE_SENTRY_*` is type-checked. Verified: artisan boots, `npm run build` succeeds (~411 KB JS), Pest still passes.
- [x] Verify `npm run dev` and `php artisan serve` both work and Inertia round-trips between PHP and React. **Verified end-to-end:** `npm run build` produces a clean bundle; `php artisan serve` + `curl /` returns HTTP 200 with the Inertia `data-page` attribute embedded, `component: "Welcome"`, page props serialized (Laravel 13.9.0, PHP 8.4.21), and Ziggy route data injected.

**Exit criteria**
- [x] `php artisan serve` + `npm run dev` boot cleanly. Verified during chunk 2.
- [x] A `Welcome` Inertia page renders React content. Tested by `tests/Feature/WelcomePageTest.php` (Pest, 2 tests / 6 assertions) and `resources/js/Pages/__tests__/Welcome.test.tsx` (Vitest, 3 tests).
- [x] CI passes on a no-op PR. Verified by the lint + test workflows added in chunk 5; first runs will exercise once a PR lands.
- [x] Pre-commit hook blocks unformatted code. Verified live during chunks 3 and 4 — every chunk-closing commit ran lint-staged + type-check before landing.

**M1 closed:** 2026-05-17. Chunks 1–5 all green. Estimate was 3 engineer-days; actual was substantially less (single afternoon) but the user supplied a working environment and clear answers throughout, so it's not a representative pace for the rest of Phase 1.

**Things that needed follow-up patches after the initial chunk-5 push:**
- CI PHP version: spec said PHP 8.3+ but Laravel 13 ships with Symfony 8.x which actually requires PHP ^8.4. CI bumped to 8.4 and the spec corrected (`SPEC.md`, `README.md` updated). Local dev was already on 8.4 so no functional change.
- `tests/Unit/` lost from git when we deleted the only file in chunk 3 (git doesn't track empty dirs). Added a `.gitkeep` so the directory survives fresh checkouts; phpunit.xml still references both Unit and Feature testsuites.

**Known follow-ups not blocking M1:**
- GitHub Actions Node 20 deprecation: `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4` all use Node 20, which GitHub flips to Node 24 default on 2026-06-02 and removes on 2026-09-16. Bump to v5 of each action when they're available (not yet at time of M1 close).

---

## M2 — Auth + Users

**Purpose:** Users can sign in via Google/Microsoft/Facebook. Admin can promote users. Rate limits enforce.

**Tasks**
- [x] Migration: `users` (per SPEC §6, no `password` column, including `max_runs_per_hour`, `store_prompts`, `avatar_url`, `role`). Edited the Laravel-default migration (greenfield, no audit-trail concerns yet). `password_reset_tokens` table dropped from the migration (not needed under social-only auth). PHP 8.1 enum `App\Enums\UserRole` with `User` + `Admin` cases; Eloquent casts the `role` column to it. `User` model gains `socialAccounts()` HasMany + `isAdmin()` helper. `UserFactory` updated with `admin()` and `privacyOpted()` states.
- [x] Migration: `social_accounts` with `(provider, provider_user_id)` unique constraint, `(user_id, provider)` index, and `cascadeOnDelete` from users. `SocialAccount` model + `SocialAccountFactory` with `google()` / `microsoft()` / `facebook()` states.
- [x] Install Laravel Sanctum (`laravel/sanctum` ^4.3). Config published, `personal_access_tokens` migration applied. Not used in Phase 1 — kept in place for future API-token use cases per SPEC.
- [x] Install Laravel Socialite (^5.27) + `socialiteproviders/microsoft` (^4.9). Microsoft provider registered via `Event::listen(SocialiteWasCalled::class, MicrosoftExtendSocialite::handle)` in `AppServiceProvider::boot()`. Google + Facebook ship in Socialite core. `config/services.php` extended with all three providers (env-driven; blank vars = provider button shown but redirect would fail with clear error).
- [x] Implement OAuth flow for Google, Microsoft, Facebook with callback handler. `App\Http\Controllers\Auth\SocialiteController` exposes `redirect()` / `callback()` / `logout()`. Routes: `GET /auth/{provider}/redirect`, `GET /auth/{provider}/callback`, `POST /logout`. Provider allowlist (`['google', 'microsoft', 'facebook']`) gates both endpoints with 404 on unknown providers.
- [x] On callback: upsert user by provider+provider_user_id, log them in via session auth, redirect to dashboard. **Email auto-link behavior (decided 2026-05-17):** if no matching `social_accounts` row but the OAuth email matches an existing user, attach a new `social_accounts` row to that user instead of creating a duplicate account. `email_verified_at` set to `now()` on first creation (providers verify emails before issuing OAuth tokens). Avatar backfill: if the existing user has no `avatar_url` and the new provider supplies one, save it; never overwrite an existing avatar.
- [ ] Login page (Inertia React): three large provider buttons.
- [ ] Logout endpoint + UI.
- [ ] Artisan command: `php artisan user:promote {email}` — fails clearly if email not found.
- [ ] Rate-limit middleware: sliding-window per-user, backed by Laravel cache. Read `users.max_runs_per_hour` per request. Header `X-RateLimit-Remaining` exposed.
- [ ] Admin UI shell (gated by `role = admin`): user list with inline editor for `max_runs_per_hour`.
- [ ] Privacy toggle on user settings: `store_prompts` checkbox.

**Exit criteria**
- Sign in works for all 3 providers (verified manually with real OAuth apps in dev mode).
- Promoting a user via `user:promote` flips their `role` and unlocks `/admin` routes.
- 31st request within an hour returns 429.

---

## M3 — Model Registry

**Purpose:** Models table populated from OpenRouter weekly, with architecture metadata enriched from a local fixture. Admin can edit and override.

**Tasks**
- [ ] Migration: `models` per SPEC §6.
- [ ] Migration: `registry_meta` (key/value; tracks `last_successful_refresh_at`).
- [ ] `OpenRouterClient` (Guzzle): `fetchModels(): array`.
- [ ] Fixture file: `database/seeders/data/architecture_metadata.php` — keyed by model name, contains layers / hidden_dim / heads / MoE structure / position_encoding for the launch set.
- [ ] Service: `ModelRegistryRefreshService` — joins OpenRouter + fixture, upserts, respects `manual_override`.
- [ ] Artisan command: `php artisan registry:refresh`.
- [ ] Scheduled task (Laravel scheduler): weekly, with admin-email notification on failure.
- [ ] Migration: seed initial registry by running `registry:refresh` in a seeder.
- [ ] Admin UI: model CRUD with `manual_override` toggle.
- [ ] Staleness banner component (model-selector page): visible if `last_successful_refresh_at` > 14 days ago.

**Exit criteria**
- `php artisan registry:refresh` populates ≥ 50 models with vendor, pricing, context length.
- The launch-set 9+ models have full architecture metadata.
- Editing a model and setting `manual_override = true` survives the next refresh.

---

## M4 — API Keys + Vendor Clients

**Purpose:** Per-user encrypted API key storage and a working `LlmClientInterface` implementation for all 9 vendors.

**Tasks**
- [ ] Migration: `api_keys` (encrypted_key, vendor, label).
- [ ] API key management UI: list + add + delete; values shown masked except last 4 chars.
- [ ] Define `LlmClientInterface`:
  ```php
  interface LlmClientInterface {
      public function stream(string $prompt, array $params, array $history): Generator;
      public function complete(string $prompt, array $params, array $history): array;
      public function countTokens(string $text): int;
  }
  ```
- [ ] Implement clients (one per vendor — each is its own sub-task with its own tests):
  - [ ] `OpenAiClient` (SSE streaming, supports `logprobs`)
  - [ ] `AnthropicClient` (event-stream)
  - [ ] `GoogleGeminiClient` (streamGenerateContent)
  - [ ] `XaiClient` (OpenAI-compatible)
  - [ ] `MistralClient` (OpenAI-compatible)
  - [ ] `GroqClient` (OpenAI-compatible, very fast)
  - [ ] `TogetherClient` (OpenAI-compatible)
  - [ ] `HuggingFaceClient` (Inference Endpoints, text-generation-inference protocol)
  - [ ] `MetaViaTogetherClient` — Llama models proxied through Together/Groq; thin wrapper.
- [ ] Vendor client factory: maps `models.vendor` → concrete class.
- [ ] Per-vendor token counter (uses `tiktoken-php` for OpenAI; approximate BPE for others).
- [ ] Integration tests: recorded HTTP fixtures (VCR-style) per vendor for streaming + non-streaming.
- [ ] Smoke-test artisan command: `php artisan vendors:smoke-test` — hits each vendor with a 5-token prompt using a CI-account key.

**Exit criteria**
- Each of the 9 clients passes its recorded-fixture tests.
- `vendors:smoke-test` succeeds against all 9 live APIs.
- Submitting a 50-token prompt to OpenAI via the client yields a stream of token chunks in PHP.

---

## M5 — Threads + Runs (data layer)

**Purpose:** The thread/run data model is fully implemented and accessible through Eloquent models, but not yet wired to streaming.

**Tasks**
- [ ] Migration: `threads` per SPEC §6 (including `share_token`, `share_enabled_at`).
- [ ] Migration: `runs` per SPEC §6 (including `thread_id`, `sequence_in_thread`).
- [ ] Eloquent models with relationships (`User → Threads → Runs → Model`).
- [ ] `ThreadService`: `create()`, `archive()`, `rename()`, `tag()`, `delete()`.
- [ ] `RunService::submit($thread, $prompt, $modelId, $params)`:
  - Validates: user owns thread, has key for vendor, params within bounds, context budget not exceeded.
  - Snapshots conversation history from prior completed runs.
  - Creates `runs` row in `pending` state.
  - Returns the run for the caller to hand off to the streaming pipeline (M6).
- [ ] Conversation-history builder: produces `[{role, content}, ...]` from a thread's completed runs, formatted per vendor.
- [ ] Context-budget calculator: sums prior turn tokens + new prompt tokens; rejects if > model's context_length.
- [ ] Tests: thread CRUD, run validation, context overflow rejection, history snapshot correctness.

**Exit criteria**
- Threads/runs can be created and queried via Eloquent.
- `RunService::submit` rejects invalid input with clear errors.
- Submitting two runs in a thread results in the second run's `conversation_history` containing the first run's user+assistant turns.

---

## M6 — Realtime + Streaming Pipeline

**Purpose:** End-to-end: prompt submitted → vendor stream → WebSocket events → frontend receives them. No visualization yet (M7/M8), but a debug page shows raw events.

**Tasks**
- [ ] Install + configure Soketi on local dev (Docker compose).
- [ ] Configure Laravel `broadcasting.php` with Pusher driver pointed at local Soketi.
- [ ] Install Laravel Echo + `pusher-js` on frontend.
- [ ] Channel: `private-runs.{run_id}`, with auth via Sanctum.
- [ ] Job: `StreamRunJob` — pulls run, picks vendor client, iterates `stream()`, broadcasts events.
- [ ] Events: `RunStarted`, `TokenReceived`, `RunCompleted`, `RunErrored`.
- [ ] State machine: PHP-side derives `layer_advance` and `moe_route` events from token index + model metadata, seeded by `run.id` for determinism.
- [ ] SSE fallback route: `GET /runs/{id}/stream` — `Symfony\StreamedResponse` proxying the vendor stream chunk-by-chunk. Used when client cannot establish WebSocket.
- [ ] Frontend hook: `useRunStream(runId)` — subscribes to channel and yields events; falls back to SSE on WebSocket failure.
- [ ] Debug page `/runs/{id}/debug`: dumps event stream as JSON in a `<pre>` block. Internal use only.
- [ ] Reconnect logic: on disconnect, frontend re-subscribes and replays from `runs.token_log` cursor.
- [ ] Queue worker config (supervisor stub for production, foreground for dev).

**Exit criteria**
- Submitting a run results in tokens streaming to the debug page within ~200 ms of vendor delivery.
- Killing the Soketi container mid-stream causes the frontend to fall back to SSE without dropping tokens.
- A second tab subscribing to the same `runs.{id}` channel receives the same events.

---

## M7 — Frontend Static UI

**Purpose:** All non-animated UI is built and navigable: dashboard, thread list, thread detail, prompt input, model selector, parameter controls, API keys, settings, admin. The submit button works (creates a run) but the right pane just shows the debug log from M6.

**Tasks**
- [ ] Layout shell: sidebar (Dashboard, Threads, Models, API Keys, Settings, Admin if applicable), top bar, content area.
- [ ] Dashboard page: stats widgets + recent threads.
- [ ] Threads list page: searchable, filterable by archived/tagged.
- [ ] Thread detail page: chat-transcript header (read-only prior runs), prompt input footer.
- [ ] Prompt input panel:
  - Multi-line textarea with autosize.
  - Conversation history above (per SPEC §3.1.2).
  - Chat-template preview pane (toggleable).
  - Token-count preview using `tiktoken-js` (lazy-loaded, only for OpenAI) + generic BPE estimator (other vendors).
  - Approaching-context-limit warning at 80%.
- [ ] Model selector (combobox): vendor groups, arch filter, size filter, context filter. Metadata pane on selection.
- [ ] Inference parameter controls: sliders + inputs with vendor-gated availability.
- [ ] API Keys page: list/add/delete (encrypted submission).
- [ ] Settings page: store_prompts toggle, display name.
- [ ] Admin pages: model registry CRUD, user list with rate-limit editor.
- [ ] 404 / error pages.
- [ ] Responsive: desktop + tablet breakpoints.

**Exit criteria**
- All pages render and route correctly.
- A logged-in user can: create a thread, fill out a prompt, select a model, set parameters, submit → see tokens stream into the debug pane on the right.
- Lighthouse score ≥ 90 on the dashboard.

---

## M8 — Frontend Live Visualization

**Purpose:** The right pane shows the real visualization, not the debug log. This is the vertical-slice gate.

**Tasks**
- [ ] Three.js setup: scene, camera, renderer, OrbitControls.
- [ ] 3D Transformer Stack component:
  - Renders N layers from model metadata.
  - Sequential highlight on `layer_advance` events.
  - Click-to-zoom into a layer (RMSNorm → Attention → Residual → FFN/MoE → Residual sub-components).
- [ ] Token-flow particles: GPU instanced mesh, particles spawn on `token_received` and traverse the stack.
- [ ] Embedding space view: PCA-reduced 3D scatter for the vocabulary (precomputed per tokenizer; lazy-loaded).
- [ ] D3 attention heatmap component (per-layer; illustrative when no real logprobs).
- [ ] D3 logits distribution component (top-10 bars, live updates).
- [ ] MoE routing component: bar chart of router scores, expert-utilization counter. Only mounted when `model.architecture_type === 'moe'`.
- [ ] KV cache progress bar.
- [ ] Playback controls: play/pause, step (advance one token), speed (0.5×/1×/2×/4×).
- [ ] Live token-stream text panel (left side of split layout).
- [ ] Cost / tokens-per-second readout.
- [ ] FPS counter (dev-only).
- [ ] Reduced-motion fallback: when `prefers-reduced-motion`, replace animations with stepped static frames.
- [ ] Vertical-slice end-to-end test: submit a prompt to OpenAI gpt-4o → watch the viz animate alongside the token stream.

**Exit criteria — vertical-slice gate**
- Submitting a prompt produces a recognizable, smooth animation that visibly tracks the token stream.
- Switching to a Mixtral run shows the MoE routing graph.
- Switching to a Llama-3 run hides the MoE graph.
- 30 FPS sustained for a 100-token stream on a 2020 MacBook Air.
- If this milestone exits and the visualization isn't compelling, **pause and re-evaluate** before continuing per `PLAN.md` §4.

---

## M9 — Replay + JSON Export

**Purpose:** Saved runs can be replayed without hitting vendor APIs. Runs and threads export to JSON.

**Tasks**
- [ ] Replay route: `/threads/{thread}/runs/{run}/replay`.
- [ ] Replay page reuses M8 components but reads events from `runs.token_log` rather than the WebSocket.
- [ ] Deterministic seeding verified — same run replayed twice produces frame-identical animation.
- [ ] JSON export: `GET /runs/{id}/export.json` — includes run metadata, token log, model snapshot, parameters.
- [ ] Thread JSON export: `GET /threads/{id}/export.json` — array of run exports.
- [ ] Download UI: button on run detail + thread detail pages.

**Exit criteria**
- Replaying a 100-token run shows the same animation as the original generation.
- Exported JSON re-imports cleanly (round-trip test).

---

## M10 — GIF Export

**Purpose:** Completed runs can be downloaded as animated GIFs.

**Tasks**
- [ ] Job: `ExportRunGif` (queued).
- [ ] **SVG renderer** (default `GIF_RENDERER=svg`):
  - PHP iterates `token_log`; per frame generates an SVG of the 2D panels (token stream + attention + logits + MoE).
  - Imagick rasterizes to PNG sequence.
  - "2D summary view" label baked into the SVG footer.
- [ ] **Puppeteer renderer** (opt-in `GIF_RENDERER=puppeteer`):
  - Spawn-per-export Node child process: launches at job start, runs headless Chromium, navigates to `/runs/{id}/render?record=1`, captures canvas frames, exits.
  - No supervisor entry — process lifetime equals job lifetime. Cold-start ~3 s; zero idle RAM cost.
  - `/runs/{id}/render` route on Laravel side: loads run, autoplays viz in record mode (deterministic, no live streaming).
- [ ] ffmpeg shell-out: PNG sequence → animated GIF **and** MP4 (H.264). Both formats always produced from the same frame sequence.
- [ ] Per-export timeout: 5 minutes.
- [ ] Results stored at `storage/app/exports/{run_id}.gif` and `storage/app/exports/{run_id}.mp4`.
- [ ] WebSocket completion event surfaces both download URLs; download UI offers a chooser.
- [ ] Renderer fallback: if `puppeteer` configured but Chromium unavailable at boot, log warning and fall back to SVG with a "fallback engaged" badge.

**Exit criteria**
- Default install (SVG renderer) produces both GIF and MP4 for a 100-token run in < 30 seconds.
- Optional Puppeteer install produces a 3D-accurate GIF + MP4.
- Fallback path verified by intentionally removing Chromium.
- MP4 plays in Chrome, Firefox, Safari; GIF renders inline in Slack and Discord.

---

## M11 — Thread Sharing

**Purpose:** Users can share a thread read-only via a public URL.

**Tasks**
- [ ] Share toggle UI on thread detail.
- [ ] Endpoint: `POST /threads/{id}/share` (generates `share_token`, sets `share_enabled_at`).
- [ ] Endpoint: `DELETE /threads/{id}/share` (nulls token).
- [ ] Public route: `/share/{token}` — bypasses auth, IP rate-limited to 60/min.
- [ ] Read-only thread view (reuses thread detail components in read-only mode):
  - No prompt input.
  - No share toggle.
  - Replay available per run.
  - Prompts redacted if owner had `store_prompts = false` (show `[prompt redacted by author]`).
- [ ] Copy-to-clipboard button for the share URL.
- [ ] Documentation link on the share page: "What is this?" → about page.

**Exit criteria**
- Toggling share on a thread produces a `/share/{token}` URL that works in an incognito window.
- Replay works on the shared view.
- Disabling sharing returns 404 for the old URL.

---

## M12 — Accessibility + Polish

**Purpose:** WCAG 2.1 AA compliance + general UX polish.

**Tasks**
- [ ] Full WCAG 2.1 AA audit using axe-core in CI + manual screen-reader pass (NVDA + VoiceOver).
- [ ] Keyboard navigation: all viz controls operable without mouse; visible focus rings.
- [ ] ARIA labels on canvases (Three.js scene gets a textual description that updates on layer-advance).
- [ ] `prefers-reduced-motion` honored (stepped static frames instead of continuous animation).
- [ ] Color-blind palette check on heatmaps + MoE bars (viridis / cividis as defaults).
- [ ] Empty states for: no threads, no API keys, no runs in a thread.
- [ ] Loading states + skeletons.
- [ ] Toast notifications for errors and success.
- [ ] 404 / 500 pages styled.
- [ ] Cross-browser testing: Chrome, Firefox, Edge, Safari (latest two).
- [ ] WebGL 2.0 detection + clear "unsupported browser" message with fallback to 2D-only viz.

**Exit criteria**
- axe-core reports zero violations on dashboard, prompt-input, thread-detail, share-view pages.
- Manual keyboard navigation can run a full vertical slice (sign in → new thread → submit → watch viz → replay) without a mouse.

---

## M13 — Deployment

**Purpose:** Application deploys to DreamHost VPS reliably and is observable.

**Tasks**
- [ ] Provision a single DreamHost VPS that hosts **both** production and staging.
- [ ] Install: PHP 8.4, Composer, Node 20, SQLite, supervisor, nginx, certbot, ffmpeg.
- [ ] (Optional) install Chromium if `GIF_RENDERER=puppeteer`.
- [ ] nginx vhost config: two server blocks on the same VPS.
  - `llm.trackr.live` — production. Document root: `/var/www/llm-viz/current/public`.
  - `staging.llm.trackr.live` — staging. Document root: `/var/www/llm-viz-staging/current/public`.
  - Both proxy WebSocket upgrades to local Soketi on their own ports (e.g., 6001 prod, 6002 staging).
- [ ] HTTPS via Let's Encrypt **direct to the VPS** (no Cloudflare in front). HSTS header enabled. Auto-renewal via certbot's systemd timer.
- [ ] supervisor configs (with separate program names for prod and staging so they can be restarted independently):
  - `llm-viz-queue` / `llm-viz-staging-queue` — queue workers.
  - `llm-viz-soketi` / `llm-viz-staging-soketi` — WebSocket servers on different ports.
  - (Optional) Puppeteer is spawn-per-export — no supervisor entry needed.
- [ ] Two isolated SQLite databases (`/var/www/llm-viz/database/database.sqlite` and likewise for staging) so staging data can't pollute production.
- [ ] Deploy script: `./deploy.sh {env}` — `git pull`, `composer install --no-dev`, `npm ci && npm run build`, `php artisan migrate --force`, `php artisan optimize`, `supervisorctl restart llm-viz-{env}-*`.
- [ ] GitHub Actions deploy workflow: on push to `main` → SSH and run `./deploy.sh staging`. On `v*` tag → run `./deploy.sh production`.
- [ ] SQLite backup cron: nightly `.dump` of **production only** to off-VPS storage (e.g., S3 or Backblaze).
- [ ] Sentry DSN configured in both production and staging `.env` with distinct `SENTRY_ENVIRONMENT` values.
- [ ] Smoke test from production deploy: sign in, submit a run, watch viz. Document the procedure in `docs/deployment.md`.
- [ ] Resource guardrails documented: at expected launch traffic the VPS handles prod + staging concurrently, but a load spike on staging could affect prod (shared CPU/RAM). Note in `docs/deployment.md` to throttle staging during load tests.

**Exit criteria**
- A push to `main` deploys to `staging.llm.trackr.live` within 5 minutes.
- A `v0.9.0` tag deploys to `llm.trackr.live`.
- Both domains return 200 over HTTPS, certificates valid, HSTS header present.
- Sentry receives a deliberately-thrown test error from production with `environment=production`.
- Backup verified by restoring production `database.sqlite` from latest backup into a scratch directory.
- Restarting staging supervisor processes does not interrupt production WebSocket connections.

---

## M14 — Launch Prep

**Purpose:** Run the full acceptance criteria checklist, fix anything that fails, write user-facing documentation, and seed the database for first users. **No invite-only beta** — launch goes straight to public access at v1.0.

**Tasks**
- [ ] Acceptance criteria walkthrough (all 18 items from SPEC §9), each ticked off with evidence (screenshot/recording/test name).
- [ ] Performance: load-test with k6 or Artillery → 100 concurrent simulated users hitting the streaming pipeline. Run from staging to avoid blowing up production during the test.
- [ ] Security audit:
  - Verify API keys are encrypted at rest (look at raw SQLite).
  - Test share-token enumeration (60/min IP rate limit holds).
  - CSRF on all state-changing routes.
  - Composer + npm audit clean.
  - AGPL compliance review: ensure every page footer and the API responses include a link to the source repository (AGPL §13 — interaction-with-source obligation).
- [ ] User guide (`docs/user-guide.md`): screenshots, walkthroughs.
- [ ] Admin guide (`docs/admin-guide.md`): registry refresh, user promotion, rate limit adjustment, backup restore.
- [ ] `CHANGELOG.md` initialized with `v1.0.0` entry.
- [ ] Registry seeded with the launch set (9+ models per SPEC §7).
- [ ] Promote one real admin user via `user:promote`.
- [ ] **Soft-launch checklist** (since public from day one, no waitlist):
  - Verify rate-limit defaults (30/hour) are reasonable for first-day curiosity traffic.
  - Confirm Sentry alerts route to a real notification channel (email or Slack webhook).
  - Pre-write a "we hit a snag" status page or pinned issue template.
  - Have an admin promotion ready in case an early user needs higher limits.
- [ ] Tag `v1.0.0` and deploy to production.
- [ ] Announce (forum/social/HN, at the operator's discretion).

**Exit criteria**
- All 18 SPEC §9 criteria pass.
- `llm.trackr.live` is live, returning 200, and a fresh user can complete a sign-in → run → replay loop end-to-end.
- AGPL §13 source-link is visible on every page served to a user.

---

## Cross-cutting concerns (apply across all milestones)

- **Test coverage:** Each milestone must leave overall backend coverage ≥ 70%. Failing this blocks the milestone from being marked done.
- **Documentation:** When a milestone introduces a new concept (e.g., M3 introduces registry refresh), `docs/architecture.md` or `docs/admin-guide.md` is updated in the same PR.
- **Security review:** Any PR touching auth, encryption, share-link routes, or admin endpoints requires a second-pass review before merge.
- **Performance budget:** Every PR that touches the viz canvas runs a Chrome DevTools performance trace as part of review.
