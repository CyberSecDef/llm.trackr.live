# Phase 1 — Launch Product

**Goal:** Ship the LLM Process Visualizer as defined in [`SPEC.md`](../SPEC.md). All 9 vendors, persistent threads, real-time visualization, replay, export (JSON + GIF), opt-in thread sharing, deployed to DreamHost VPS.

**Status:** Not started.
**Source of truth for scope:** `SPEC.md` §2.1 (in scope) and §2.2 (out of scope).

This document breaks Phase 1 into 14 milestones (M1–M14). Each milestone lists its purpose, concrete tasks, dependencies, exit criteria, and a rough effort estimate.

> **Note on estimates.** Time estimates are in "engineer-days" assuming one person working full-time and familiar with the stack. They are planning aids, not commitments.

---

## Milestone overview

| # | Milestone | Depends on | Estimate | Vertical-slice gate? |
|---|---|---|---|---|
| M1 | Foundation | — | 3 days | |
| M2 | Auth + Users | M1 | 4 days | |
| M3 | Model Registry | M2 | 4 days | |
| M4 | API Keys + Vendor Clients | M2 | 12 days | |
| M5 | Threads + Runs (data) | M3, M4 | 4 days | |
| M6 | Realtime + Streaming Pipeline | M5 | 6 days | |
| M7 | Frontend — Static UI | M5 | 7 days | |
| M8 | Frontend — Live Visualization | M6, M7 | 12 days | ✅ End-of-M8 = vertical slice |
| M9 | Replay + JSON Export | M8 | 4 days | |
| M10 | GIF Export | M8 | 6 days | |
| M11 | Thread Sharing | M9 | 3 days | |
| M12 | Accessibility + Polish | M11 | 5 days | |
| M13 | Deployment | M12 | 5 days | |
| M14 | Launch Prep | M13 | 5 days | |
| | **Total** | | **~80 engineer-days** | |

---

## M1 — Foundation

**Purpose:** Empty repo → working Laravel + React + Vite dev environment with CI and linters.

**Tasks**
- [ ] `composer create-project laravel/laravel:^11` in repo root.
- [ ] Install Inertia.js Laravel adapter + React preset.
- [ ] Install Tailwind CSS 3 + configure `tailwind.config.js`.
- [ ] Configure Vite for React + Inertia.
- [ ] Switch DB driver to SQLite; create `database/database.sqlite`.
- [ ] Set up Laravel Pint config.
- [ ] Set up ESLint + Prettier for JS/TS.
- [ ] Install Husky + lint-staged for pre-commit hooks.
- [ ] Install Pest for PHP testing.
- [ ] Add `.editorconfig`, `.gitignore` (Laravel + Node), `.gitattributes`.
- [ ] Create `.env.example` with all required env vars (empty values).
- [ ] GitHub Actions workflow: `lint.yml` (Pint, ESLint, Prettier) + `test.yml` (Pest + React Testing Library).
- [ ] Install Sentry Laravel SDK + frontend SDK (DSNs read from `.env`, no-op if blank).
- [ ] Verify `npm run dev` and `php artisan serve` both work and Inertia round-trips between PHP and React.

**Exit criteria**
- `php artisan serve` + `npm run dev` boot cleanly.
- A `Welcome` Inertia page renders React content.
- CI passes on a no-op PR.
- Pre-commit hook blocks unformatted code.

---

## M2 — Auth + Users

**Purpose:** Users can sign in via Google/Microsoft/Facebook. Admin can promote users. Rate limits enforce.

**Tasks**
- [ ] Migration: `users` (per SPEC §6, no `password` column, including `max_runs_per_hour`, `store_prompts`, `avatar_url`, `role`).
- [ ] Migration: `social_accounts`.
- [ ] Install Laravel Sanctum.
- [ ] Install Laravel Socialite + `socialiteproviders/microsoft`.
- [ ] Implement OAuth flow for Google, Microsoft, Facebook with callback handler.
- [ ] On callback: upsert user by provider+provider_user_id, log them in via Sanctum, redirect to dashboard.
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
  - Node sidecar script: launches headless Chromium, navigates to `/runs/{id}/render?record=1`, captures canvas frames.
  - Supervisor config to run the sidecar.
  - `/runs/{id}/render` route on Laravel side: loads run, autoplays viz in record mode (deterministic, no live streaming).
- [ ] ffmpeg shell-out: PNG sequence → animated GIF (and MP4 in parallel).
- [ ] Per-export timeout: 5 minutes.
- [ ] Result stored at `storage/app/exports/{run_id}.gif` (+ `.mp4`).
- [ ] WebSocket completion event surfaces download URLs.
- [ ] Renderer fallback: if `puppeteer` configured but Chromium unavailable at boot, log warning and fall back to SVG with a "fallback engaged" badge.

**Exit criteria**
- Default install (SVG renderer) produces a GIF for a 100-token run in < 30 seconds.
- Optional Puppeteer install produces a 3D-accurate GIF.
- Fallback path verified by intentionally removing Chromium.

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
- [ ] Provision DreamHost VPS (or document an existing one).
- [ ] Install: PHP 8.3, Composer, Node 20, SQLite, supervisor, nginx, certbot, ffmpeg.
- [ ] (Optional) install Chromium if `GIF_RENDERER=puppeteer`.
- [ ] nginx vhost config: `llm.trackr.live` + `staging.llm.trackr.live`.
- [ ] HTTPS via Let's Encrypt + HSTS header.
- [ ] supervisor configs:
  - Queue worker (`php artisan queue:work`).
  - Soketi.
  - (Optional) Puppeteer sidecar.
- [ ] Deploy script: `./deploy.sh` — `git pull`, `composer install --no-dev`, `npm ci && npm run build`, `php artisan migrate --force`, `php artisan optimize`, `supervisorctl restart all`.
- [ ] GitHub Actions deploy workflow: on push to `main` → SSH to staging and run `deploy.sh`. On `v*` tag → SSH to production.
- [ ] SQLite backup cron: nightly `.dump` to off-VPS storage (e.g., S3 or Backblaze).
- [ ] Sentry DSN configured in production `.env`.
- [ ] Smoke test from production deploy: sign in, submit a run, watch viz. Document the procedure in `docs/deployment.md`.

**Exit criteria**
- A push to `main` deploys to staging within 5 minutes.
- A `v0.9.0` tag deploys to production.
- Sentry receives a deliberately-thrown test error from production.
- Backup verified by restoring `database.sqlite` from latest backup into a scratch directory.

---

## M14 — Launch Prep

**Purpose:** Run the full acceptance criteria checklist, fix anything that fails, write user-facing documentation, and seed the database for first users.

**Tasks**
- [ ] Acceptance criteria walkthrough (all 18 items from SPEC §9), each ticked off with evidence (screenshot/recording/test name).
- [ ] Performance: load-test with k6 or Artillery → 100 concurrent simulated users hitting the streaming pipeline.
- [ ] Security audit:
  - Verify API keys are encrypted at rest (look at raw SQLite).
  - Test share-token enumeration (60/min IP rate limit holds).
  - CSRF on all state-changing routes.
  - Composer + npm audit clean.
- [ ] User guide (`docs/user-guide.md`): screenshots, walkthroughs.
- [ ] Admin guide (`docs/admin-guide.md`): registry refresh, user promotion, rate limit adjustment, backup restore.
- [ ] `CHANGELOG.md` initialized with `v1.0.0` entry.
- [ ] Registry seeded with the launch set (9+ models per SPEC §7).
- [ ] Promote one real admin user via `user:promote`.
- [ ] Tag `v1.0.0` and deploy.
- [ ] Announce.

**Exit criteria**
- All 18 SPEC §9 criteria pass.
- `llm.trackr.live` is live, returning 200, and a fresh user can complete a sign-in → run → replay loop end-to-end.

---

## Cross-cutting concerns (apply across all milestones)

- **Test coverage:** Each milestone must leave overall backend coverage ≥ 70%. Failing this blocks the milestone from being marked done.
- **Documentation:** When a milestone introduces a new concept (e.g., M3 introduces registry refresh), `docs/architecture.md` or `docs/admin-guide.md` is updated in the same PR.
- **Security review:** Any PR touching auth, encryption, share-link routes, or admin endpoints requires a second-pass review before merge.
- **Performance budget:** Every PR that touches the viz canvas runs a Chrome DevTools performance trace as part of review.
