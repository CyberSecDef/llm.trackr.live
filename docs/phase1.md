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
| M2 | Auth + Users | M1 | 4 days | ✅ Complete | |
| M3 | Model Registry | M2 | 4 days | ✅ Complete | |
| M4 | API Keys + Vendor Clients | M2 | 12 days | ✅ Complete | |
| M5 | Threads + Runs (data) | M3, M4 | 4 days | ✅ Complete | |
| M6 | Realtime + Streaming Pipeline | M5 | 6 days | ✅ Complete | |
| M7 | Frontend — Static UI | M5 | 7 days | 🟡 In progress (chunks 1–3 done) | |
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
- [x] Login page (Inertia React): three large provider buttons. `resources/js/Pages/Login.tsx` is the dedicated sign-in page with branding, an error banner that reads `errors.social` from Inertia's auto-shared errors prop, and a "back to home" link. The OAuth callback failure path in `SocialiteController::callback()` now redirects to `route('login')` (instead of `route('home')`) so the error displays where the user came from. Vitest covers button presence, route wiring, back link, and no-error default state.
- [x] Logout endpoint + UI. POST `/logout` was wired in chunk 2; chunk 3 adds the visible UI in `AppLayout.tsx` (logout form button in the sidebar footer). Dashboard's standalone logout button removed in favor of the layout-level one.
- [x] Artisan command: `php artisan user:promote {email}`. Implemented as `App\Console\Commands\PromoteUser` using Laravel 13 attribute-based signature/description. Three behaviors: promotes a user-role user → admin, no-ops with clear message if already admin, fails with non-zero exit + hint ("the user must sign in at least once") if no user matches. 3 Pest tests cover all branches.
- [x] Rate-limit middleware: per-user, per-hour, backed by Laravel's `RateLimiter` facade. Registered as a named limiter `runs` in `AppServiceProvider::boot()` — the closure reads `users.max_runs_per_hour` live on every request so admin edits take effect immediately. Routes attach via `middleware('throttle:runs')`. The actual run-submission route lands in M5/M6; for now the limiter is verified via a test-only stub route. `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers are set by Laravel's `ThrottleRequests` middleware automatically. Note: Laravel's `Limit::perHour` is a fixed-hour-bucket scheme, not a true sliding window — close enough for our use case; can swap to a true sliding implementation later if user-visible behavior on the bucket boundary becomes a problem.
- [x] Admin UI shell (gated by `role = admin`): user list with inline editor for `max_runs_per_hour`. `App\Http\Controllers\Admin\UsersController@index` paginates 20-per-page (User::orderByDesc('created_at')); `update` validates `max_runs_per_hour` as integer 0–10000 then redirects back with a `rate-limit-updated:{user_id}` flash status. Frontend at `resources/js/Pages/Admin/Users.tsx` renders a table with an inline `<RateLimitForm>` per row (number input + Save button + ✓ indicator on save). Routes gated by the existing `admin` alias from chunk 3.
- [x] Privacy toggle on user settings: `store_prompts` checkbox. `App\Http\Controllers\SettingsController@show` renders the page with the current value; `update` validates as boolean and redirects back with `settings-saved` flash status. Frontend uses Inertia's `useForm` with explicit Save button (not auto-save). Flash status read via the new `flash.status` shared prop (added to `HandleInertiaRequests::share()`).

**Exit criteria**
- [~] Sign in works for all 3 providers (verified manually with real OAuth apps in dev mode). **Verified at the mock level:** `tests/Feature/Auth/SocialiteCallbackTest.php` (10 tests) exercises the full callback flow for each provider via Socialite's mockable contracts — user creation, existing-link login, email auto-link, avatar backfill, logout, guest gating. **Real-credential verification deferred** until the user provisions OAuth apps with Google/Microsoft/Facebook and populates `.env`. The `.env.example` keys are in place from M1 chunk 3.
- [x] Promoting a user via `user:promote` flips their `role` and unlocks `/admin` routes. Verified by `tests/Feature/Console/PromoteUserCommandTest.php` (3 tests, including the user-not-found error case) combined with `tests/Feature/Auth/AuthGatedRoutesTest.php` ("returns 403 when a non-admin hits /admin/users" + "renders the Admin Users page for an admin").
- [x] 31st request within an hour returns 429. Verified by `tests/Feature/RateLimit/RunsRateLimiterTest.php` ("returns 429 when the per-user limit is exceeded"). The actual test uses `max_runs_per_hour = 3` for speed; the assertion is identical at any limit, including the default 30.

**M2 closed:** 2026-05-17. Chunks 1–5 all green. The single 🟠 marker on the manual-OAuth criterion is the only thing standing between M2 and a full ✅, and it's gated on the operator provisioning real OAuth credentials — not on any code work.

**M2 retrospective notes:**
- **Real value of `eslint-plugin-jsx-a11y`:** caught a `<label>` without explicit `htmlFor` association on the Settings page during chunk 4. Cost ~30 seconds to fix; would otherwise have surfaced in the WCAG audit at M12.
- **Vite manifest gotcha (twice):** adding new Inertia pages without running `npm run build` produces "Unable to locate file in Vite manifest" 500s in Pest tests. CI handles this (test workflow runs `npm run build` before Pest); local doesn't. Not adding a guard, but worth knowing.
- **Inertia page glob picked up a test file:** in chunk 2 the path `Pages/__tests__/Welcome.test.tsx` got bundled into the production build via the page-resolver glob — 457 KB of Vitest leaked into prod. Moved tests to `resources/js/__tests__/Pages/` (outside the glob). Worth a CI guard later if this happens again.
- **Auto-link by email decision (chunk 2):** users with the same email across providers now share one account. Acceptable since Google/MS/FB all verify emails before issuing OAuth tokens. If we see a single phishing/takeover report, revisit by adding an explicit "link account" workflow.
- **Sliding-window vs fixed-bucket rate limiting (chunk 4):** SPEC said sliding, used fixed-hour-bucket via Laravel's built-in. Documented; swap if bucket-boundary unfairness becomes a real complaint.

**Stats:** Pest 52 tests / 147 assertions, Vitest 8 tests. All CI green.

---

## M3 — Model Registry

**Purpose:** Models table populated from OpenRouter weekly, with architecture metadata enriched from a local fixture. Admin can edit and override.

**Tasks**
- [x] Migration: `models` per SPEC §6 — plus `manual_override` (refresh-skip flag) and `metadata_estimated` (best-guess marker for closed-source layer counts). Architecture metadata columns (`architecture_type`, `layers`, `hidden_dim`, `attention_heads`, `moe_experts`, `moe_active_experts`, `position_encoding`) are all nullable since OpenRouter doesn't expose them — they're populated by the fixture or admin edits in chunks 2 and 4. PHP 8.1 enums `App\Enums\ArchitectureType` and `App\Enums\PositionEncoding` provide strong typing; Eloquent casts both columns. Eloquent model named `App\Models\LlmModel` (with explicit `$table = 'models'`) to avoid shadowing `Illuminate\Database\Eloquent\Model`. Factory + states (`moe()`, `vendor()`, `estimated()`, `manuallyOverridden()`).
- [x] Migration: `registry_meta` (key/value; tracks `last_successful_refresh_at`). String-primary-key key/value table with JSON value column and `updated_at` only (no created_at — meta entries are upserted, not "created"). `App\Models\RegistryMeta` exposes `getValue($key)`, `setValue($key, $value)`, and `forget($key)` static helpers. `setValue` uses the Query Builder's `updateOrInsert` rather than Eloquent's `updateOrCreate` so identical-value writes still bump `updated_at` (otherwise the dirty-checking in `save()` would skip the write and break "last refresh time" tracking).
- [x] `OpenRouterClient` (Guzzle): `fetchModels(): array`. Implemented in `App\Services\OpenRouter\OpenRouterClient` using Laravel's `Http` facade (Guzzle under the hood). Normalizes each row: splits the `vendor/model` id, converts per-token pricing strings to per-million-token floats, extracts display_name and context_length. Skips rows with unparseable ids (missing slash, null/non-string id). Throws `RuntimeException` on HTTP failure or missing `data` array. Reads base URL from `config('services.openrouter.base_url')`, defaulting to `https://openrouter.ai/api/v1`. Constructor optional `$baseUrl` override for tests.
- [x] Fixture file: `database/seeders/data/architecture_metadata.php`. Keyed by `models.name` (post-slash portion of OpenRouter id). Each entry carries `architecture_type`, `layers`, `hidden_dim`, `attention_heads`, `moe_experts`/`moe_active_experts` (where applicable), `position_encoding`, display_name override, capability flags, and `metadata_estimated` (true for closed-source vendors, false for open-weights). All 10 Phase 1 launch-set models present per SPEC §7. Open-weights (Llama 3.1 70B/405B, Mixtral 8x22B) have real architecture data; closed-source (GPT-4o, Claude 3.5, Gemini 1.5 Pro, Grok 2, Mistral Large) are flagged estimated with rope position encoding as a sensible default.
- [x] Service: `ModelRegistryRefreshService` — joins OpenRouter + fixture, upserts, respects `manual_override`. Implemented in `App\Services\ModelRegistry\RefreshService` with a small `RefreshResult` value object. Logic: fetch upstream, load fixture, for each row check for existing match by `name`, skip if `manual_override = true`, else merge OpenRouter base with fixture entry (fixture wins on overlap), upsert. Wraps everything in a DB transaction so a catastrophic failure rolls back the partial state; per-row exceptions are caught and recorded in `RefreshResult.errors` so one bad row doesn't kill the whole refresh. On success, writes `last_successful_refresh_at` and `last_refresh_summary` to `registry_meta`. Constructor takes the client; `refresh(?$fixturePath)` accepts an override path for tests.
- [x] Artisan command: `php artisan registry:refresh`. Implemented as `App\Console\Commands\RegistryRefresh` using Laravel 13 attribute-based signature. Accepts `--fixture=` to override the architecture metadata path (for tests / staging). Outputs the `RefreshResult::summary()` string on success and any per-row errors. Exit code 0 on success, 1 on uncaught `RuntimeException` from the service.
- [x] Scheduled task (Laravel scheduler): weekly, with admin-email notification on failure. Registered in `routes/console.php` (Laravel 11+ pattern, replacing the old Kernel::schedule). Runs `weeklyOn(1, '03:00')` — Monday 03:00 UTC, intentionally off-peak. `->onFailure(...)` callback queries `User::where('role', UserRole::Admin)` and sends `App\Notifications\RegistryRefreshFailed` to all admins via the `mail` channel. With `MAIL_MAILER=log` in dev, failure notifications appear in `storage/logs/laravel.log` rather than emailing anyone.
- [x] Seeder for initial registry: `Database\Seeders\ModelRegistrySeeder` calls `RefreshService` on `php artisan migrate --seed`. Resilient: catches network failures with a clear warning rather than aborting the seed. Short-circuits in the `testing` env so Http::fake() controls test fixtures without the seeder interfering. Wired into `DatabaseSeeder::run()`.
- [x] Admin UI: model CRUD with `manual_override` toggle. `App\Http\Controllers\Admin\ModelsController` provides `index` / `edit` / `update` / `destroy` / `refresh`. Index has search (name + display_name), vendor filter, architecture filter, paginated at 25, with badge indicators for `manual_override` and `metadata_estimated`. Edit form covers all admin-editable fields grouped into Identity / Architecture / Capacity+pricing / Capabilities / Chat template / Refresh control sections (skipping `supported_params` JSON — too low-frequency to merit a UI for now). Validation: vendor required, architecture_type/position_encoding constrained to enum values, numeric ranges enforced on layers/hidden_dim/heads/MoE/context/pricing. Refresh button posts to `admin.models.refresh` which invokes `RefreshService::refresh()` and surfaces success summary or `errors.refresh` flash. Delete is a hard delete — M5's `runs.model_id` foreign key will need an ON DELETE strategy when that lands. The placeholder `/models` route now redirects authenticated admins to `/admin/models` and keeps a `ComingSoon → M7` placeholder for non-admins (public model browser is an M7 deliverable). Sidebar split into `Admin · Users` and `Admin · Models`, both admin-only.
- [x] Staleness banner component: visible to all authed users when `last_successful_refresh_at > 14 days ago` (or never). Threshold (14 days) is a public constant `HandleInertiaRequests::STALENESS_THRESHOLD_DAYS` per SPEC §7.1. Shared with every Inertia page via a `registry` prop (`is_stale`, `days_stale`, `last_refresh_at`). Banner lives in `resources/js/Components/RegistryStalenessBanner.tsx` and renders inside `AppLayout` just above the page content — only when stale. Admins see "View registry" + "Refresh now" actions; non-admins see "Ask an admin to run the registry refresh". The SPEC said "model-selector page"; we put it in the layout so the warning is visible on every authed page since the registry feeds cost estimates app-wide. When M7 ships the public model selector, it can either rely on the layout banner or add a more prominent variant.

**Exit criteria**
- [~] `php artisan registry:refresh` populates ≥ 50 models with vendor, pricing, context length. **Verified at the mock level:** `RefreshServiceTest` exercises the full create/update/skip cycle against `Http::fake()` responses. **Real ≥ 50-model count deferred** until first production run hits the live OpenRouter API (the upstream typically returns 100+ models). The fixture, refresh service, and command are otherwise complete and tested.
- [x] The launch-set 9+ models have full architecture metadata. `database/seeders/data/architecture_metadata.php` contains all 10 SPEC §7 launch-set entries. `ArchitectureMetadataFixtureTest` verifies presence + correctness of `metadata_estimated` flags + Mixtral 8x22B MoE structure.
- [x] Editing a model and setting `manual_override = true` survives the next refresh. Verified by `RefreshServiceTest::it skips rows with manual_override = true` — pre-existing row with `manual_override = true` and stale context_length is untouched after the refresh runs. The admin UI's Edit form (chunk 4) is the path admins use to set this flag.

**M3 closed:** 2026-05-17. Chunks 1–5 all green.

**M3 retrospective notes:**
- **The `RegistryMeta::setValue` Eloquent dirty-checking gotcha (chunk 1):** `updateOrCreate` skips DB writes when no attribute is dirty, so repeated identical refreshes wouldn't bump `updated_at`. Switched to Query Builder's `updateOrInsert`. This is the kind of subtlety that would have shipped silently and only surfaced months later when "last refresh" data stopped moving.
- **`Pages/__tests__/` glob leak revisited (chunk 4):** moved 3 new test files (Admin/Models test, registry tests) outside `resources/js/Pages/` to keep the M2 chunk-2 lesson holding. Worth adding a CI check that fails the build if any `.test.tsx` file appears inside `Pages/`.
- **`expectsOutputToContain` consumes substring (chunk 3):** Laravel 13's PendingCommand consumes the matched substring from the captured buffer, so chained assertions on overlapping content silently fail. Switch to a single longer substring or split into separate tests.
- **`$this->seed(SeederClass)` wires a mocked OutputStyle (chunk 3):** that doesn't expect SymfonyStyle's internal `askQuestion()` calls from `$this->command->info()`. Workaround: invoke the seeder directly via `app(SeederClass)->run()`. The `?->` null-safe operator skips the command-bound output.
- **Staleness banner in AppLayout, not just model-selector (chunk 5):** SPEC said model selector (M7 territory). We put it layout-level since registry data feeds cost estimates everywhere. When M7 lands, can re-evaluate placement.

**Stats:** Pest 121 tests / 329 assertions, Vitest 8 tests. All CI green.

---

## M4 — API Keys + Vendor Clients

**Purpose:** Per-user encrypted API key storage and a working `LlmClientInterface` implementation for all 9 vendors.

**Tasks**
- [x] Migration: `api_keys` (encrypted_key, vendor, label). Schema includes `user_id` (FK with cascadeOnDelete), `vendor`, nullable `label`, encrypted `encrypted_key` (text, via Eloquent's `encrypted` cast), denormalized `last_four` (cached plaintext suffix to avoid per-row decrypts on the list view), nullable `last_used_at`, timestamps. `UNIQUE(user_id, vendor, label)` per SPEC §6 so a user can hold multiple keys per vendor under different labels. `App\Models\ApiKey` with `$casts['encrypted_key' => 'encrypted']` + `booted()` event that recomputes `last_four` on every save when the key is dirty. `encrypted_key` hidden from serialization. `User::apiKeys()` HasMany added. ApiKeyFactory with `vendor()` / `withLabel(?string)` / `withKey()` states.
- [x] API key management UI: list + add + delete; values shown masked except last 4 chars. `App\Http\Controllers\ApiKeysController` with `index` / `store` / `destroy` — authenticated only, plus a 403 check in `destroy` so users can't delete each other's keys (even admins are blocked — BYOK trust means admins shouldn't see other users' secrets). Vendor allowlist `SUPPORTED_VENDORS` (the same 9 from SPEC §3.2.2) gates the validation. Duplicate (vendor, label) returns a friendly `label` validation error instead of a DB exception. Page at `resources/js/Pages/ApiKeys/Index.tsx` replaces the chunk-3 ComingSoon placeholder. Form has vendor select / optional label / masked password input. Existing keys table shows masked display (`••••XXXX`), last_used date, and a Delete button. Flash banners for add/delete. Plaintext key value is never echoed back to the client after creation.
- [x] Define `LlmClientInterface`. Parked decision (`docs/parked-decisions.md` item 2) resolved 2026-05-17 in favor of hand-rolled — Laravel AI SDK doesn't expose logprobs (needed for SPEC §3.1.5 logits panel) and has no custom-vendor extension path; Prism is still pre-1.0. The interface is in `app/Services/Llm/Contracts/LlmClientInterface.php` with three methods: `stream()` returns `Generator<int, LlmTokenChunk>`, `complete()` returns `LlmCompletion`, plus a `vendor()` identifier for factory registration. Slight refinement from the SPEC: takes an `ApiKey` model + the `model` string explicitly (rather than relying on globals), and yields/returns typed value objects (`LlmTokenChunk`, `LlmCompletion`, `LlmUsage`) instead of bare arrays. Vendor-specific exceptions (`InvalidApiKeyException`, `VendorRateLimitedException`, generic `LlmClientException`) communicate user-actionable error categories.
- [ ] Implement clients (one per vendor — each is its own sub-task with its own tests):
  - [x] `OpenAiClient` (SSE streaming, supports `logprobs`). Lives at `app/Services/Llm/Clients/OpenAiClient.php`. Streams via `POST /v1/chat/completions` with `stream: true`, parses SSE through a reusable `App\Services\Llm\Support\SseParser`. Requests `stream_options.include_usage = true` so the final chunk carries token totals. Passes through `temperature`, `top_p`, `max_tokens`, `seed`; silently drops `top_k` (not an OpenAI param). When `params.logprobs = true`, sets `top_logprobs = 5` (or override) so the logits panel can show the top-5 alternatives. HTTP error mapping: 401/403 → `InvalidApiKeyException`, 429 → `VendorRateLimitedException` (with `Retry-After` parsed), other non-2xx → generic `LlmClientException`. `api_keys.last_used_at` updated on success. Registered with `LlmClientFactory` in `AppServiceProvider::boot()`. **Designed as the base class for chunk 4's 4 OpenAI-compatible vendors** (xAI, Mistral, Groq, Together) — subclasses only override `vendor()` and `defaultBaseUrl()`.
  - [x] `AnthropicClient` (event-stream). Bespoke — `x-api-key` header + `anthropic-version: 2023-06-01`. System prompts extracted from history into a top-level `system` field. `max_tokens` mandatory on Anthropic; defaults to 4096 if caller didn't specify. No logprobs support. Reuses `SseParser` for the SSE shell; dispatches on the `type` field inside each event (`message_start`, `content_block_delta`, `message_delta`, `message_stop`). Tracks cumulative usage across the stream since Anthropic reports `input_tokens` in `message_start` and `output_tokens` in the trailing `message_delta`.
  - [x] `GoogleGeminiClient` (streamGenerateContent). Bespoke. Auth via URL query string (`?key=…`), not a header. Endpoint: `/v1beta/models/{model}:streamGenerateContent?alt=sse`. Body uses `contents`+`parts` shape instead of `messages`; role `assistant` mapped to `model`; system messages extracted into top-level `systemInstruction`; param naming differs (`topP`/`topK`/`maxOutputTokens` under `generationConfig`). Reuses `SseParser`. No logprobs support.
  - [x] `XaiClient` (OpenAI-compatible). Thin subclass of `OpenAiClient` — only overrides `vendor()`, `defaultBaseUrl()` (api.x.ai/v1), and `extraHeaders()` to drop the OpenAI-Organization header. All payload / streaming / error-mapping logic inherited.
  - [x] `MistralClient` (OpenAI-compatible). Same pattern; base URL api.mistral.ai/v1. Mistral's optional `safe_prompt` parameter isn't exposed in our params shape; can be added if needed.
  - [x] `GroqClient` (OpenAI-compatible, very fast). Same pattern; base URL api.groq.com/openai/v1 (note the `/openai/` prefix — Groq exposes their OpenAI-compatible surface there).
  - [x] `TogetherClient` (OpenAI-compatible). Same pattern; base URL api.together.xyz/v1. Will also back `MetaViaTogetherClient` in chunk 5.
  - [x] `HuggingFaceClient` (Inference Endpoints). **SPEC deviation:** SPEC called for TGI native protocol; we use HF's OpenAI-compatible chat-completions surface instead because (a) it handles per-model chat templates server-side, (b) the wire format matches OpenAI exactly so `SseParser` and `OpenAiClient`'s payload code reuse cleanly, (c) most managed HF Inference Endpoints expose this surface. Thin subclass of `OpenAiClient`. No global base URL — users configure `services.huggingface.base_url` per their Inference Endpoint URL; per-model `api_base_url` overrides wire in at M5/M6.
  - [x] `MetaViaTogetherClient` — Llama models proxied through Together. Trivial subclass of `TogetherClient` overriding only `vendor()`. Exists so the model registry can list Llama models under `vendor='meta'` while still routing to Together's API. Key resolution: M5/M6 run-submission layer picks which `ApiKey` to pass (UX note: a fallback "use Together key if no Meta key exists" would be friendlier — deferred to M5).
- [x] Vendor client factory: maps `models.vendor` → concrete class. `App\Services\Llm\LlmClientFactory` is registration-based — concrete clients call `$factory->register($client)` and are looked up by `vendor()`. Registered as a singleton in `AppServiceProvider::register()` so registrations apply app-wide and tests can swap implementations via the same instance. `clientFor()` throws `UnsupportedVendorException` on unknown vendor. The 9 concrete client registrations land in chunks 3-5.
- [x] Per-vendor token counter (uses `tiktoken-php` for OpenAI; approximate BPE for others). `yethee/tiktoken` ^1.1 installed (PHP port of OpenAI's BPE tables). `TokenCounterInterface` exposes `count()` + `isExact()` (the UI uses the latter to decide whether to show a `~` prefix). `OpenAiTokenCounter` selects encoding by model name (o200k_base for GPT-4o family, cl100k_base for older). `ApproximateTokenCounter` uses chars/4 with a small whitespace adjustment (±20% accuracy in English prose). `TokenCounterFactory` returns the OpenAI counter for `vendor=openai` and the approximate counter for everything else. `EncoderProvider` cached as a singleton so BPE tables load once per process.
- [x] Integration tests: recorded HTTP fixtures (VCR-style) per vendor for streaming + non-streaming. Each client suite (`OpenAiClientTest`, `AnthropicClientTest`, `GoogleGeminiClientTest`, the OpenAI-compat cluster dataset, the HF/Meta subclass tests) uses `Http::fake()` with realistic vendor SSE bodies / non-streaming JSON payloads as inline PHP strings. Vendor-side error codes (401/403/429/500) are also fixture-driven. **Inline-string fixtures over fixture files** is a deliberate trade-off for now — extract to `tests/Fixtures/Llm/*.{sse,json}` when test files start sharing payloads.
- [x] Smoke-test artisan command: `php artisan vendors:smoke-test`. Implemented as `App\Console\Commands\VendorsSmokeTest`. Iterates `LlmClientFactory::supportedVendors()`, reads each vendor's test key from `SMOKE_TEST_{VENDOR}_KEY` env var (skips with a clear notice if unset), reads optional model override from `SMOKE_TEST_{VENDOR}_MODEL`, sends `"Say 'ok' and nothing else."` with `max_tokens: 10, temperature: 0`. Reports per-vendor status (✓ passed / ✗ failed / ○ skipped). Default behavior: stop on first failure; `--keep-going` to continue. `--vendor=name` filter (repeatable) for testing a single vendor. Returns 0 if all pass-or-skip, 1 if any fail. **Safe to run with no env configured at all** — exits 0 with all-skipped (intentional so it can be wired into a deploy hook before keys are provisioned). Uses transient (unsaved) `ApiKey` instances; `ApiKey::touchUsed()` was updated to no-op for unsaved models so the smoke test doesn't insert orphan rows.

**Exit criteria**
- [x] Each of the 9 clients passes its recorded-fixture tests. **Verified:** ~99 tests across the 9 client + factory + token-counter + value-object suites, all green.
- [~] `vendors:smoke-test` succeeds against all 9 live APIs. **Mock-level verified:** command flow / error handling / exit codes / env-var skip / `--vendor` filter / `--keep-going` all tested with fake clients. **Real-network verification deferred** until operator provisions `SMOKE_TEST_*_KEY` env vars with CI-account keys.
- [x] Submitting a 50-token prompt to OpenAI via the client yields a stream of token chunks in PHP. **Verified at the mock level** by `OpenAiClientTest`. Real-network verification follows once keys are provisioned.

**M4 closed:** 2026-05-17. Chunks 1–6 all green.

**M4 retrospective notes:**
- **The parked Laravel-AI-SDK vs hand-rolled decision** (chunk 2) was the most consequential M4 choice. Laravel AI SDK covers all 9 vendors but doesn't expose logprobs — SPEC §3.1.5's logits panel needs them. Going hand-rolled meant more code (chunks 3–5) but full control of raw signals. If the viz ends up not needing logprobs after all, the Laravel AI SDK becomes a viable refactor target — every concrete client could be replaced with a thin SDK wrapper behind `LlmClientInterface`.
- **The 9 vendors clustered better than expected.** OpenAI-compatible (5) + bespoke (3) + wrapper (1). The base-class abstraction in `OpenAiClient` paid off twice: chunk 4's cluster (5 vendors × ~15 LOC each) and chunk 5's HuggingFace.
- **Pint's `php_unit_method_casing` rule trips on any class with a method starting with `test`** — even non-test classes. Caught at chunk 6 when my private `testVendor()` got snake-cased to `test_vendor` (breaking the caller). Renamed to `attemptVendor` to avoid. Consider excluding the rule for `app/Console/` if we hit this again.
- **`ApiKey::touchUsed` had to become defensive** so the smoke-test command could use transient `ApiKey` instances without inserting orphan rows. One-line guard; never fires in normal production flow.
- **SPEC deviation on HuggingFace** (chunk 5): SPEC said TGI native, we went OpenAI-compatible. Documented in `HuggingFaceClient` docblock + commit. Practical reasons: chat templates handled server-side, code reuse from `OpenAiClient`. Revisit if a user-deployed endpoint exposes only the TGI surface.
- **Inline-string SSE fixtures** instead of fixture files: works fine at 9 vendors. Extract when payloads start being shared across tests.

**Stats:** Pest 244 tests / 578 assertions, Vitest 8 tests. All CI green.

---

## M5 — Threads + Runs (data layer)

**Purpose:** The thread/run data model is fully implemented and accessible through Eloquent models, but not yet wired to streaming.

**Tasks**
- [x] Migration: `threads` per SPEC §6 (including `share_token`, `share_enabled_at`). Schema: user_id (cascade), nullable title (auto-filled to first 60 chars of first prompt at M5 chunk 4), nullable system_prompt, nullable default_model_id with `nullOnDelete` so a removed model doesn't break the thread, default_parameters JSON, archived bool default false, tags JSON, share_token unique (M11 sharing), share_enabled_at, last_activity_at, timestamps. Indexed by user_id / archived / last_activity_at.
- [x] Migration: `runs` per SPEC §6 (including `thread_id`, `sequence_in_thread`). Schema: thread_id (cascade), denormalized user_id (cascade), model_id with **restrictOnDelete** so admin-deleting a model with runs is blocked (matches M3 chunk 4's design note), sequence_in_thread (unique with thread_id), nullable prompt (privacy opt-out per SPEC §10.4), prompt_hash always required (deterministic replay seed), conversation_history / parameters / token_log all JSON nullable, output_text + numeric timing/cost columns, status (cast to `App\Enums\RunStatus`: Pending / Streaming / Complete / Error with `isTerminal()`), nullable error_message.
- [x] Eloquent models with relationships (`User → Threads → Runs → Model`). `Thread::runs()` orders by sequence_in_thread by default. `Run::thread()/user()/model()` BelongsTo. `User::threads()` and `User::runs()` HasMany. `LlmModel::runs()` HasMany (with explicit `model_id` FK because `Factory::for()` would otherwise auto-derive a `llmModel()` relation name from the class). `Thread::isShared()` helper; `Run::isTerminal()` delegating to the enum.
- [x] `ThreadService`: `create()`, `archive()`, `rename()`, `tag()`, `delete()`. Plus `unarchive()` for symmetry. `App\Services\Threads\ThreadService` is deliberately Eloquent-thin — authorization stays in the controller/policy layer above. `create()` accepts optional `title` / `system_prompt` / `default_model_id` / `default_parameters` / `tags`; title left null lets RunService::submit (chunk 4) auto-fill from the first prompt. `rename()` trims whitespace and rejects empty strings with `InvalidArgumentException`. `tag()` normalizes (trim per-tag, drop empty/whitespace-only, dedupe case-sensitively to preserve "AI" vs "ai" intent); empty array or null clears tags. `delete()` is a hard delete — FK cascade drops the thread's runs. None of these methods touch `last_activity_at` (only run-submission does in chunk 4).
- [x] `RunService::submit($user, $thread, $model, $prompt, $params)`. Signature refined from SPEC: takes `User` + `LlmModel` objects (caller resolves them via Laravel route binding) instead of scalar IDs. Validates in order: user owns thread (`ThreadOwnershipException`), prompt non-empty (`EmptyPromptException`), params within SPEC §3.1.4 bounds (`InvalidParamsException`), user has API key for the model's vendor with **Meta → Together fallback** (`NoApiKeyException`), context budget not exceeded with `max_tokens` reserved for response (`ContextOverflowException`). Then in a DB transaction: auto-titles the thread (first 60 chars of first prompt, word-boundary truncated, ellipsis if truncated) on the first run only, bumps `last_activity_at`, computes next `sequence_in_thread`, applies privacy redaction per `user.store_prompts` (nulls `prompt` and `conversation_history` but always stores `prompt_hash`), snapshots model architecture into `parameters.model_snapshot` for replay determinism (SPEC §10.1), creates the Run in `pending` state. Returns the Run with `thread`/`user`/`model` relations pre-set so the M6 pipeline doesn't need to re-load. All five failure modes raise a `RunSubmissionException` subclass that the HTTP layer in M6 maps to status codes.
- [x] Conversation-history builder: produces `[{role, content}, ...]` from a thread's completed runs. `App\Services\Threads\ConversationHistoryBuilder::build($thread)` returns a vendor-agnostic array starting with `{role: 'system', content: thread.system_prompt}` (if non-empty), followed by alternating `{role: 'user'}` / `{role: 'assistant'}` pairs from prior **completed** runs ordered by `sequence_in_thread`. Pending/streaming/errored runs are skipped. **Privacy-redacted runs (prompt=null or output_text=null) are skipped entirely** — including a half-pair would give the model nonsensical context. Documented as a known limitation: users wanting continuity keep `store_prompts=true`. The caller's new prompt is NOT appended here — that's the vendor client's job (each protocol formats the current turn differently).
- [x] Context-budget calculator: `App\Services\Threads\ContextBudgetCalculator::check($model, $history, $newPrompt, $reservedForResponse = 0)`. Returns a `ContextBudgetResult` value object with `fits / totalTokens / budget / overBy` so the caller can surface a useful "you're N tokens over a Y-token window" message. Routes to OpenAI's exact tiktoken counter when `vendor=openai`, else the approximate counter — same `TokenCounterFactory` as the prompt-preview UI. Models with null/zero `context_length` are treated as unlimited (`fits=true`) since we can't enforce a budget we don't know. **Defense-in-depth check** — the frontend already does a precise client-side check before submit (SPEC §3.5); this guards against a malicious or buggy client.
- [x] Tests: thread CRUD, run validation, context overflow rejection, history snapshot correctness. Covered across chunks 1–4: `ThreadModelTest` (11), `RunModelTest` (14), `ThreadServiceTest` (18), `ConversationHistoryBuilderTest` (10), `ContextBudgetCalculatorTest` (10), `RunServiceTest` (22) — 85 M5 tests in total.

**Exit criteria**
- [x] Threads/runs can be created and queried via Eloquent. Verified by `ThreadModelTest` + `RunModelTest` (25 tests covering persistence, casts, relations, FK behavior).
- [x] `RunService::submit` rejects invalid input with clear errors. Verified by `RunServiceTest` validation group (10 tests): wrong owner, empty prompt, no key, all four param bounds, context overflow with details — each raising a distinct `RunSubmissionException` subclass.
- [x] Submitting two runs in a thread results in the second run's `conversation_history` containing the first run's user+assistant turns. Verified by `RunServiceTest::it stores the conversation history snapshot` — creates a completed first run, submits a second, asserts the second run's snapshot is `[{user: first q}, {assistant: first a}]`.

**M5 closed:** 2026-05-18. Chunks 1–5 all green.

**M5 retrospective notes:**
- **Migration timestamp collision.** `php artisan make:migration` produced both `create_threads_table` and `create_runs_table` with the same timestamp; runs would have run alphabetically first despite its FK to threads. Bumped the runs filename timestamp by 1s. Worth knowing for any future multi-migration commit — generate them seconds apart or rename.
- **`Factory::for($model)` auto-derives the relation name** from the related model's class name (camelCase). `LlmModel` → `llmModel()`. We define the relation as `model()` for cleaner code, so test setups need `Factory::for($model, 'model')` explicitly.
- **Pest's `toThrow(string)` does substring matching, not isinstance** when given a string. `toThrow(\Throwable::class)` reads as "the exception message contains the substring 'Throwable'" — never matches real exceptions. Use concrete exception classes (`QueryException::class`, etc.).
- **Test factories + unique constraints.** Hardcoding `'name' => 'gpt-4o'` in tests clashes with factories made in `beforeEach`. Drop the override; the factory generates unique names; OpenAI token counter falls back to `o200k_base` for unknown names so behavior is identical.
- **Pint's `lambda_not_used_import` rule** auto-strips unused variables from closure `use()` lists. Useful but can be surprising if you expected a future-use placeholder to stick around — annotate intent in a comment if you really want to keep it.
- **The Meta-via-Together key fallback** was closed here in RunService (chunk 4), addressing the UX gap noted at M4 chunk 5. When a user submits a `vendor=meta` model and has no `meta` API key but DOES have a `together` key, the service silently uses the Together key. No-op for users who explicitly added a Meta key.

**Stats:** Pest 329 tests / 756 assertions, Vitest 8 tests. All CI green.

---

## M6 — Realtime + Streaming Pipeline

**Purpose:** End-to-end: prompt submitted → vendor stream → WebSocket events → frontend receives them. No visualization yet (M7/M8), but a debug page shows raw events.

**Tasks**
- [x] Install + configure Laravel Reverb on local dev. (SPEC originally said Soketi; swapped to Reverb at M6 chunk 1 — see `docs/parked-decisions.md` item 1.) `composer require laravel/reverb` ^1.10. `config/reverb.php` + `routes/channels.php` published. `bootstrap/app.php` extended with `channels: __DIR__.'/../routes/channels.php'` so channel-auth routes register at boot.
- [x] Configure Laravel `broadcasting.php` with the `reverb` driver. `BROADCAST_CONNECTION=reverb` set in `.env.example`. Old PUSHER_* env keys renamed to `REVERB_*` to match Laravel conventions. Vite frontend env mirrors (`VITE_REVERB_APP_KEY` etc.) added for the chunk 4 Echo wiring. `resources/js/types/global.d.ts` `ImportMetaEnv` augmentation updated accordingly.
- [x] Install Laravel Echo + `pusher-js` on frontend (chunk 4b). `laravel-echo` ^2.3 + `pusher-js` ^8.5 — pusher-js handles the Reverb-compatible WebSocket transport. `resources/js/echo.ts` initializes `window.Echo` from the `VITE_REVERB_*` env vars; init is conditional on `VITE_REVERB_APP_KEY` being set so environments without Reverb config don't bomb the bundle on load. Side-effect-imported from `app.tsx` before any page subscribes. `npm audit` flags 3 moderate transitive `ws` advisories via socket.io-client (one of laravel-echo's optional transports we don't use); the vulnerable code is unreachable in our pusher-js bundle. Future hardening (M13 deployment) can add a package.json `overrides` block if it matters.
- [x] Channel: `private-runs.{run_id}` (chunk 4a). Registered in `routes/channels.php` via `Broadcast::channel('runs.{runId}', ...)` — the callback resolves the Run by ID and authorizes only when `run->user_id === user->id`. Nonexistent runs and stranger requests both return `false` (and thus 403 from `/broadcasting/auth`) — the closure doesn't distinguish them to avoid leaking the existence of other users' runs. Auth flow: pusher-js POSTs `socket_id` + `channel_name` to `/broadcasting/auth` (the route Laravel auto-registers from `bootstrap/app.php`'s `withRouting(channels: ...)`); on 200, Laravel signs the channel with the broadcasting secret and the client uses that signature to subscribe. 4 Pest tests cover owner/stranger/nonexistent/unauthenticated paths. **Test-env wrinkle:** `BROADCAST_CONNECTION=pusher` is set in `phpunit.xml` so the channel-auth endpoint actually runs the callback — the default `log` driver's `auth()` is a no-op that returns 403 for everything, which would make the tests pass trivially for the wrong reason. Fake `PUSHER_APP_*` values are fine since no network leaves the box.
- [ ] Job: `StreamRunJob` — pulls run, picks vendor client, iterates `stream()`, broadcasts events.
- [x] Events: `RunStarted` (chunk 1), `TokenReceived`, `LayerAdvanced`, `MoeRouted`, `RunCompleted`, `RunErrored`. All in `App\Events\Runs\`, all implement `ShouldBroadcastNow` on `private-runs.{run_id}` (refactored from `ShouldBroadcast` in chunk 3 — per-token broadcasts fire from inside the queued `StreamRunJob` worker, so going through the queue again would cost an extra round-trip and risk out-of-order delivery; `ShouldBroadcastNow` keeps the broadcast in-process and ordered). Each `broadcastWith()` returns a JSON-safe payload (scalars + arrays only) so the frontend doesn't need to know about Eloquent shapes. `MoeRouted` is the only one that's vendor-conditional (emitted only for `architecture_type='moe'` model snapshots).
- [x] State machine: `App\Services\Runs\RunEventEmitter` translates each `LlmTokenChunk` into a deterministic event sequence: `TokenReceived` + `LayerAdvanced`, plus `MoeRouted` for MoE models. MoE expert selection is a function of `(run.id, token_index)` only, via a SHA-256-based stateless PRNG — replays produce identical animations per SPEC §10.1. Scores are synthetic descending probabilities renormalized to ~1.0 (no proprietary MoE vendor exposes real router logits, so this is illustrative-only). Also exposes `completedEvent()` (computes tokens-per-second from duration) and `erroredEvent()` for the StreamRunJob (chunk 3) to call once at terminal status.
- [x] Job: `StreamRunJob` (`App\Jobs\StreamRunJob`) — implements `ShouldQueue`, takes a `Run` via constructor. Per-run flow: refresh from DB (defensive against worker retries — bails immediately if status is no longer `Pending`); resolve user's `ApiKey` for the model's vendor with **Meta → Together fallback** mirroring `RunService::resolveApiKey`; resolve vendor client via `LlmClientFactory`; flip status to `Streaming` and broadcast `RunStarted`; iterate `client->stream(...)`. Per chunk: compute `t_ms` from `microtime(true)`, append `{token, index, t_ms, logprobs}` to in-memory `token_log` (only when `chunk->text` is non-empty), concatenate `output_text`, dispatch the events `RunEventEmitter::eventsForChunk()` returns, track the latest non-null `chunk->usage`. On clean finish: compute `duration_ms`, derive `input_tokens`/`output_tokens` (from latest usage or fall back to token count), compute `tokens_per_second`, compute `estimated_cost` from `parameters.model_snapshot` pricing (returns null when either price is absent — so a price change between submit + execute can't retroactively rewrite a recorded cost), persist final state, touch `ApiKey::last_used_at`, broadcast `RunCompleted`. On vendor exception: friendly-error mapping for `LlmClientException` subclasses (rate-limit, invalid-key, generic), persist partial `output_text` + `token_log` + `duration_ms` + `output_tokens`, broadcast `RunErrored` with the partial output. Pre-stream errors (no API key, no client registered) still broadcast `RunErrored` — the frontend's chunk-4 subscription needs the signal even if `RunStarted` never fired. 19 Pest tests cover happy path (Pending→Complete + event order + MoE + duration/TPS/cost computation + chunk-count fallback + logprobs preservation + `last_used_at` touch + cost-null when snapshot lacks pricing), error paths (mid-stream throw with partial preserved, pre-stream key/client failures, vanished-API-key, `RunErrored` dispatch), Meta→Together fallback (both directions), and idempotency (re-running a non-Pending Run is a silent no-op). **Chunk 5a edit:** added per-chunk incremental UPDATE of `token_log` + `output_text` so the SSE fallback (`/runs/{run}/stream`) can read in-flight progress from the persisted row without a message broker between processes. One additional test (#20) uses a custom observer client that captures DB snapshots after each yield, proving the row's `token_log` grows monotonically during the stream rather than only at terminal.
- [x] HTTP submission: `POST /threads/{thread}/runs` (chunk 4a). `App\Http\Requests\SubmitRunRequest` does field-level validation (model_id exists, prompt required + non-empty, parameters within SPEC §3.1.4 bounds) so the response carries proper 422 per-field errors before the service ever runs. `App\Http\Controllers\RunController::store` delegates orchestration to `RunService::submit` and translates each domain exception: `ThreadOwnershipException` → 403, `EmptyPromptException` → 422 on `prompt`, `NoApiKeyException` → 422 on `model_id` with vendor in message, `InvalidParamsException` → 422 on `parameters.{field}`, `ContextOverflowException` → 422 on `prompt`. On success: persists the Pending Run, dispatches `StreamRunJob`, returns 201 with `{run: {...}, channel: 'private-runs.{id}'}` so the frontend knows the channel to subscribe to. Route is throttled via the `'runs'` named limiter from `AppServiceProvider` (live-reads `users.max_runs_per_hour`); `X-RateLimit-*` headers come along for free. 16 Pest tests cover auth (401), authz (403 for non-owners), validation (7 fields + bounds), service exception mapping (no-API-key with vendor name in error, context overflow), success (run persisted + Bus-faked StreamRunJob dispatch + response shape + auto-title on first prompt + last_activity_at bump), Meta→Together fallback at the HTTP layer.
- [x] SSE fallback route: `GET /runs/{run}/stream` (chunk 5a). `App\Http\Controllers\StreamRunController` returns `Symfony\Component\HttpFoundation\StreamedResponse` with `Content-Type: text/event-stream`, `X-Accel-Buffering: no` (defeats nginx response buffering), `Cache-Control: no-cache`. **Architecture: polling-based, not pub/sub.** Since the queue-worker process running `StreamRunJob` has no shared memory with the PHP-FPM process serving this request, chunk 5a teaches `StreamRunJob` to write `token_log` + `output_text` incrementally on every chunk (additive to the existing terminal write — no new tests broken); the SSE controller then polls the run row every ~150 ms and emits the delta since the last cursor as SSE frames. Tail latency ~150 ms; no message broker required. Hard cap of 4000 iterations (~10 min) guards against an FPM worker hanging on a stuck run. Heartbeat comment every 200 iterations (~30 s) keeps proxies from closing the conn. Frame names match the WebSocket `broadcastAs()` strings (`run.started`, `token.received`, `layer.advanced`, `run.completed`, `run.errored`) so the frontend SSE consumer (chunk 5b) shares the same `RunEvent` type. Owner-only — same authz invariant as `runs.{runId}` channel auth. **PHP-FPM caveat:** long-lived SSE requests tie up FPM workers; M13 deployment chunk should size `pm.max_children` with this in mind. 11 Pest tests cover authz (redirect/403/404), response headers, SSE wire format, emission against already-Complete + already-Error runs, layer-count from model snapshot, partial-output preservation; tests use `streamedContent()` (not `getContent()`) to capture the streamed body.
- [x] Frontend hook: `useRunStream(runId)` (chunks 4b + 5b) — prefers WebSocket via Laravel Echo, falls back to SSE on connection failure. Returns `{ events, status, transport, disabled }` where `transport: 'websocket' | 'sse' | 'none'` exposes which path is live, `disabled` is the back-compat alias for `transport === 'none'`. Discriminated-union `RunEvent` type in `resources/js/types/runs.ts` mirrors each PHP event's `broadcastWith()` exactly. **Two-effect shape:** effect 1 resets state when (runId, transport) changes; effect 2 sets up the subscription. Splitting ensures `events: []` lands before the new transport's first event regardless of React's scheduling. **Transport selection:** picks `'websocket'` if `window.Echo` is set, else `'sse'` if `window.EventSource` exists, else `'none'`. **Fallback trigger (chunk 5b):** subscribes to pusher's `connection.state_change` and flips to SSE when state becomes `'failed'` or `'unavailable'`. Stays on SSE for the rest of the run even if WebSocket recovers — avoids transport thrashing and the dedup logic switching-back would require. **Fallback UX (chunk 5b):** clears events on transport change so the SSE controller's cursor-0 replay can repopulate without dedup. M8 can refine if the viz needs smoother UX. 21 Vitest tests cover WebSocket happy path, SSE-only path (Echo=null), WS→SSE fallback (`failed`/`unavailable` state, event reset, EventSource ctor URL, stay-on-SSE after WS recovery), `transport='none'` when neither is available, runId transitions. Mock `EventSource` is implemented as a class (not a plain `vi.fn()`) so `new EventSource()` works under jsdom (which doesn't ship EventSource).
- [x] Event names refactor (chunk 4b): added `broadcastAs()` to each of the 6 events so the frontend listens with short kebab-case names (`.run.started`, `.token.received`, `.layer.advanced`, `.moe.routed`, `.run.completed`, `.run.errored`) instead of full PHP class FQNs. Decouples the JS subscription from the PHP namespace — renaming/moving event classes won't silently break the frontend. 6 Pest tests in `RunEventBroadcastAsTest.php` lock the strings down so a future drift fails the test before it ships.
- [x] Debug page `/runs/{id}/debug` (chunks 4b + 5b): `App\Http\Controllers\DebugRunController::show` does the same-user-as-run check (mirrors the `runs.{runId}` channel auth invariant) and returns an Inertia render of `Runs/Debug` with the run's static metadata + the channel name to subscribe against. The TSX page renders the metadata header up top, a "subscribed channel + live status + active transport" line, and a chronological JSON event list below — append-only as `useRunStream` delivers events. Active transport label reads `WebSocket`, `SSE (fallback)`, or `unavailable`; chunk 5b also rewrites the disabled-notice copy to "no realtime transport is available" since SSE is now a fallback. **`config/inertia.php` added** so the Inertia view-finder knows about `.tsx` page paths (defaults are Vue-only); without this, `assertInertia(...)->component('...')` fails with "page component file does not exist" on every test. 4 Pest tests cover authz (redirect/403/404 + 200 render with prop assertions); 8 Vitest tests cover render + event accumulation + status transitions + transport label (WebSocket / SSE / unavailable) + disabled-notice gate.
- [x] Reconnect logic (chunk 6): `GET /runs/{run}/events?since=N` JSON backfill endpoint (`App\Http\Controllers\RunEventsController`) returns the persisted `token_log` slice from index N onward, plus current `status` + `completion`/`error` blocks for terminal runs. Lightweight one-shot — no streaming, no FPM-worker hold. Owner-only authz (same invariant as channel auth, SSE, and debug page). `useRunStream` tracks `maxSeenIndex` + `wasDisconnected` refs; on pusher `state_change` transitioning from `disconnected`/`connecting` back to `connected`, fires the backfill with `since=maxSeenIndex+1` and appends the returned `token_log` entries as if they arrived live. Also synthesizes `run.completed` / `run.errored` events from the response's `completion`/`error` blocks so the closing event isn't missed when the run terminates during the gap. **Pusher-js auto-reconnects WS but does not replay** — that's the gap this closes. The SSE fallback (chunk 5b) is for hard failures; this is the catch-up path for transient blips. 11 Pest tests on the endpoint (authz, slicing semantics, since clamping, terminal-state blocks) + 6 Vitest tests on the hook (initial-connect no-fetch, since=N+1 URL, run.completed/run.errored synthesis, double-reconnect dedup, error-tolerance).
- [x] Queue worker config (chunk 6): `deployment/supervisor/laravel-queue.conf` (2 worker processes, 600 s job timeout, 605 s stopwaitsecs so SIGTERM gives in-flight runs a clean exit) + `deployment/supervisor/laravel-reverb.conf` (single process — Reverb's in-memory pub/sub doesn't multi-process out of the box; horizontal scale needs the Redis backend, deferred to M13). Both `.conf` files have install instructions in the header comment. For dev: foreground via `php artisan queue:work` + `php artisan reverb:start --host=0.0.0.0`.

**Exit criteria**
- ✅ Submitting a run results in tokens streaming to the debug page within ~200 ms of vendor delivery — covered by the chunk-3 StreamRunJob tests (broadcast dispatch on each chunk + microtime-based t_ms) plus the chunk-4b useRunStream / Debug page render tests. Manual verification recipe in `docs/m6-exit-criteria.md` §1.
- ✅ Killing the Reverb process mid-stream causes the frontend to fall back to SSE without dropping tokens — covered by chunk-5b's `WS → SSE fallback` test group (transport flip on pusher `failed`/`unavailable`, event-list reset, SSE EventSource opened against `/runs/{id}/stream`) + chunk-5a's incremental `token_log` persistence (no events lost because the SSE controller replays from the persisted log, not from an in-memory queue). Manual recipe in `docs/m6-exit-criteria.md` §2.
- ✅ A second tab subscribing to the same `runs.{id}` channel receives the same events — covered by Reverb's pubsub-layer semantics (multiple subscribers to a private channel fan out identically) + channel auth tests (chunk 4a) verifying the owner-only invariant. Manual recipe in `docs/m6-exit-criteria.md` §3.

**M6 retrospective**

Sized at 6 days; landed in 6 chunks across a similar elapsed window. Quality bar held — 432 Pest tests / 1030 assertions, 43 Vitest tests; Pint / ESLint / type-check / Vite build all green at every chunk boundary.

What worked
- Splitting chunk 4 into 4a (backend HTTP + channel auth) + 4b (frontend Echo wiring + debug page) kept each commit reviewable. Same for chunk 5 (5a backend SSE / 5b frontend fallback).
- `ShouldBroadcastNow` over `ShouldBroadcast` (chunk 3): per-token broadcasts fire in-process from the queue worker, preserving order without a second queue round-trip. Caught early because the chunk-1 RunStarted event went out as `ShouldBroadcast` and would have caused subtle reordering once token streaming kicked in.
- `broadcastAs()` short kebab names (chunk 4b) decouple frontend listeners from PHP class FQNs. Renaming an event class no longer silently breaks the wire contract.
- Polling-based SSE (chunk 5a) avoided introducing Redis as a hard runtime dep — the persisted `token_log` is the source of truth, both transports read from it. Tail latency is ~150 ms which is well under the "tokens stream in real time" perception threshold.

Surprises / footnotes
- `BROADCAST_CONNECTION=log` (the default `.env` driver) no-ops on the channel-auth callback — needed `BROADCAST_CONNECTION=pusher` with fake test creds in `phpunit.xml` to actually exercise `/broadcasting/auth` in tests. Documented inline.
- Inertia's view-finder defaults to `.vue`; needed `config/inertia.php` to teach it about `.tsx` pages or `assertInertia(...)->component('...')` fails on every test.
- `assertInertia` requires the route to return a `View` (not the X-Inertia JSON form), so test HTTP calls don't pass the X-Inertia header.
- jsdom doesn't ship `EventSource`; chunk 5b needed a real ES6 class mock (not a plain `vi.fn()`) so `new EventSource()` works.
- `Symfony\StreamedResponse::getContent()` returns `false`; chunk-5a SSE tests use `streamedContent()` to actually capture the body.
- npm audit reports 3 moderate transitive `ws` advisories via socket.io-client (an optional laravel-echo transport we don't use). Unreachable in our pusher-js bundle; deferred to M13.

Decisions parked or deferred to later milestones
- Mid-stream WS↔SSE switch-back: once on SSE we stay there. Avoiding dedup complexity is worth the brief flicker. M8 can revisit if the viz needs smoother UX (chunk 5b documented this choice).
- Real cross-process pub/sub (Redis) for sub-100ms SSE: not needed for our concurrency target; polling-based SSE is good enough for launch.
- Horizontal Reverb scaling (Redis backend): single-process is fine for the single-VPS target; M13 deployment chunk will revisit if traffic warrants.
- Browser-based E2E test harness (Playwright/Cypress): chosen against in chunk 6 (unit + integration + manual recipes is enough for M6); M12 accessibility/polish is the natural home.

Carry-forward into M7
- The debug page proves the plumbing is alive end-to-end. M7's thread-detail page replaces it as the user-facing surface; the debug page stays for internal use.
- `useRunStream` is the only frontend consumer of the streaming pipeline today. M7 will refactor it into the thread-page hierarchy; the hook's contract (events + status + transport + disabled) should be enough.

---

## M7 — Frontend Static UI

**Purpose:** All non-animated UI is built and navigable: dashboard, thread list, thread detail, prompt input, model selector, parameter controls, API keys, settings, admin. The submit button works (creates a run) but the right pane just shows the debug log from M6.

**Decisions (chunk 1):**
- **Component library:** shadcn/ui (Radix + Tailwind, copy-paste pattern). Frontloads accessibility via Radix internals; gives us a consistent visual language for M7 + M8 + M12. Initial deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `lucide-react`, `@radix-ui/react-slot`. Components live in `resources/js/Components/ui/`. CSS-var-based theme tokens in `resources/css/app.css` (light + dark palettes); `<html class="dark">` makes dark the app default. `components.json` is committed for future `npx shadcn@latest add ...` calls.
- **Token counter:** server-side AJAX via the existing `TokenCounter` services (from M3). Debounced POST endpoint per chunk 5; no client-side WASM, no bundle bloat. Slight perceptible lag during fast typing is acceptable for the M7 scope.
- **Onboarding:** empty-state CTAs on each page + a "Set up your first API key" nudge on the dashboard when none exists. No dedicated wizard route.
- **Split:** 10 chunks (foundation → layout + 404 + responsive → dashboard → threads list → thread detail → prompt input → model selector → param controls → account/admin polish → closeout).

**Tasks**
- [x] Foundation (chunk 1): shadcn/ui deps installed; `resources/js/lib/utils.ts` with `cn()` helper; `tailwind.config.js` extended with theme tokens that read from CSS vars (`bg-background`, `text-foreground`, etc.); `resources/css/app.css` `:root` + `.dark` blocks define the light + dark palettes; `tailwindcss-animate` plugin registered for Radix animations. 5 baseline UI primitives in `resources/js/Components/ui/`: `button.tsx` (6 variants × 4 sizes via CVA, `asChild` Slot pattern), `card.tsx` (6 subcomponents), `input.tsx`, `label.tsx`, `separator.tsx` (decorative + a11y modes). 22 Vitest tests cover render, variant classes, `cn()` override behavior (tailwind-merge resolves conflicts so caller `h-20` beats base `h-10`), ref forwarding, `asChild` Slot, and Separator a11y modes. **Lint exception:** Label primitive disables `jsx-a11y/label-has-associated-control` inline — design-system primitives can't statically prove association; that's the caller's job (via `htmlFor` / `id`).
- [x] Layout shell (chunk 2): `AppLayout` refactored onto shadcn primitives — sidebar uses Button + Separator, nav links use theme tokens (`bg-accent` / `text-accent-foreground` for active state) instead of hardcoded slate-*. Desktop ≥ md: 240px fixed sidebar. Sub-md: sidebar hides, top bar shows a hamburger Button that opens the sidebar in a left-anchored Sheet (Radix Dialog wrapper; new primitive in `resources/js/Components/ui/sheet.tsx` with `side` variant + 4 Vitest tests). Same `NAV_ITEMS` array drives both desktop + mobile — single source of truth. Optional `<title>` prop slot in the top bar; falls back to the active nav item's label. SheetHeader/SheetTitle/SheetDescription kept in `sr-only` wrapper to satisfy Radix's a11y requirement without visual noise.
- [x] Dashboard page (chunk 3): `App\Http\Controllers\DashboardController::index` aggregates the signed-in user's stats (total run count, sum of input + output tokens across complete runs, sum of estimated_cost across complete runs) + 5 most-recent threads ordered by `last_activity_at` desc with `withCount('runs')` + `has_api_keys` boolean. Per-user isolation enforced via `where('user_id', $user->id)` on every query — covered by a cross-user-leakage Pest test. Token / cost sums skip errored / streaming / pending runs (their counts may be incomplete, their cost is null). React side (`resources/js/Pages/Dashboard.tsx`) refactored onto shadcn Card primitives: 3 stat cards in an `md:grid-cols-3` grid, recent-threads section with relative timestamps ("3h ago", "2d ago"), `NoApiKeyCallout` at the top when `has_api_keys=false` linking to `/api-keys`, `EmptyThreads` state in the recent section linking to either `/api-keys` or `/threads` depending on whether a key exists. Currency formatting via `Intl.NumberFormat`. **Per-thread links deferred to chunk 5** — recent threads display as cards but don't link individually yet (the `/threads/{id}` route lands then). "View all" link in the section header points at `/threads` (still the chunk-4-bound placeholder). 10 Pest tests (auth, prop shape, aggregation, errored-run exclusion, cross-user isolation, recent-thread ordering + count + isolation, has_api_keys flag both states); 8 Vitest tests (3 stat cards present, number-format, no-API-key callout visibility + link target, empty-threads CTA + dependency on has_api_keys, recent threads render with relative time + archived hint). **Test gotcha:** JSON has no float-vs-int distinction; `0.0` round-trips as int `0`, so the zero-cost assertion uses `0`, not `0.0`.
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
- [x] 404 / error pages (chunk 2): 4 Inertia pages in `resources/js/Pages/Errors/` (NotFound, Forbidden, Expired, ServerError) all built on a shared `ErrorShell` component. Standalone — NOT wrapped in `AppLayout` since unauthenticated users hit them too. `usePage().props.auth.user` determines whether the CTA reads "Back to dashboard" or "Sign in". `bootstrap/app.php`'s `withExceptions` callback maps 403/404/419/500/503 to the matching component and renders via Inertia when `APP_DEBUG=false`; debug-mode dev keeps the stock Laravel whoops/error pages with stack traces. JSON requests bypass the Inertia render and get the default JSON error response (so XHR callers aren't broken). 6 Pest tests cover the 404/403/500 mappings, authed + unauthed paths, and the JSON-bypass.
- [x] Responsive: desktop + tablet breakpoints (chunk 2). The sidebar↔drawer breakpoint is `md` (768px); below that the layout collapses to a single column with the hamburger Sheet. Verified on a phone (192.168.0.205:8001) via the dev-login magic-link flow.

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
  - Both proxy WebSocket upgrades to the local Reverb instance on their own ports (e.g., 8080 prod, 8081 staging).
- [ ] HTTPS via Let's Encrypt **direct to the VPS** (no Cloudflare in front). HSTS header enabled. Auto-renewal via certbot's systemd timer.
- [ ] supervisor configs (with separate program names for prod and staging so they can be restarted independently):
  - `llm-viz-queue` / `llm-viz-staging-queue` — queue workers.
  - `llm-viz-reverb` / `llm-viz-staging-reverb` — `php artisan reverb:start` on different ports.
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
