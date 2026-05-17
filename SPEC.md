# LLM Process Visualizer (LLM-Viz) — Specification

**Version:** 1.0 (Draft)
**Status:** Pre-implementation
**Document owner:** Robert Weber
**Last revised:** 2026-05-17

---

## 1. Project Overview

### 1.1 Identity
- **Project name:** LLM Process Visualizer
- **Short name / handle:** LLM-Viz
- **Domain (working):** llm.trackr.live

### 1.2 Objective
Build a web application that allows users to:
1. Input a prompt (with optional system prompt and multi-turn history).
2. Select any LLM model — dense or Mixture-of-Experts (MoE) — from supported vendors.
3. Configure inference parameters (temperature, top-p, top-k, max tokens, seed, decoding strategy).
4. Observe a real-time animated visualization of the complete end-to-end generation pipeline from prompt ingestion to final response.

### 1.3 Target Users
- AI researchers
- Developers integrating LLMs into products
- Educators teaching transformer / LLM internals
- Enthusiasts seeking intuition without local GPU infrastructure

### 1.4 Value Proposition
Interactive, step-by-step visualization of the inference pipeline:

```
prompt → tokenizer → embeddings → transformer layers
       → (MoE routing, when applicable)
       → logits → decoding strategy → detokenization → output
```

Synchronized to the actual token stream where the vendor API supports streaming; otherwise metadata-driven animation paced to wall-clock generation time.

### 1.5 Hard Constraints
- **Hosting:** DreamHost VPS — PHP 8.3+, SQLite, persistent processes allowed (queue workers, WebSocket server, ffmpeg shell-out), no GPU.
- **Backend language:** PHP only. No Python, no FastAPI, no vLLM, no Ollama, no local model execution.
- **Inference:** Performed exclusively via external vendor REST APIs (BYOK only — see §3.4).
- **Internals shown:** Metadata-driven animations. Phase 1 does *not* expose raw tensors, attention weights, QKV matrices, or expert routing data from proprietary vendors (none of them expose these via API). Animations are illustrative, paced to the real token stream.

---

## 2. Scope

### 2.1 In Scope (Phase 1)
- User authentication via social providers only: Google, Microsoft, Facebook.
- No email/password fallback in Phase 1.
- Model registry with metadata for all major vendors, dense and MoE.
- Prompt input panel with chat-template preview (special tokens rendered).
- Model selector with vendor/architecture/size/context filters.
- Real-time inference using vendor APIs with streaming (SSE / chunked) where available.
- Layered visualization dashboard:
  - **Three.js** — 3D transformer stack, embedding-space token flow.
  - **D3.js** — attention heatmaps, logits distribution, MoE routing bars.
  - **React Flow** (optional) — graph views.
- High-level simulation of internal steps driven by real token stream + static model metadata.
- Replay (from stored token log), export (JSON + animated GIF), playback speed controls.
- SQLite database for model registry, user accounts, run history, saved runs.
- Responsive UI: desktop + tablet (mobile is best-effort, not required).

### 2.2 Out of Scope (Phase 1)
- Local model execution with tensor hooks.
- Full low-level tensor capture (QKV, attention weights) for proprietary models.
- Multi-user collaboration or real-time sharing of in-progress runs.
- Mobile-native app (iOS/Android).
- Training or fine-tuning workflows.
- Production-scale GPU inference hosting.
- Open-weights local inference via a sidecar Python service (deferred to Phase 2+).

---

## 3. Functional Requirements

### 3.1 User Interface

#### 3.1.1 Homepage / Dashboard
- Sidebar navigation: Dashboard, Threads, Models, API Keys, Settings (admin: + Registry).
- Prominent **"New Thread"** primary CTA. Within a thread, the per-prompt CTA is "Visualize".
- Recent threads widget (last 5, with last-message preview and timestamp).
- Stats: total threads, total runs, tokens generated, estimated cost spent.

#### 3.1.2 Prompt Input Panel
- Large multi-line textarea for user prompt.
- Optional system prompt field (collapsible). The system prompt is set at the **thread** level — see §3.5 — and is editable in the thread settings but pre-filled in the prompt panel.
- Conversation history is rendered above the input as a scrolling chat transcript of prior turns in the current thread (read-only by default; "edit thread" enters a mode where prior messages can be edited or removed).
- **Preview pane** showing the rendered chat template with special tokens (`<|im_start|>`, `<|im_end|>`, `<s>`, `[INST]`, etc.) — template selected based on chosen model's family. Renders the full thread including the just-typed user turn.
- Token count preview:
  - For OpenAI / GPT models: exact, via `tiktoken-js` (lazy-loaded, ~1MB chunk).
  - For all other vendors: approximate via a generic BPE estimator (~30KB), displayed with a `~` prefix and tooltip "Approximate — vendor doesn't expose its tokenizer".
- A "thread is approaching context limit" warning when cumulative tokens exceed 80% of the selected model's context window.

#### 3.1.3 Model Selector
- Dropdown / searchable picker grouped by vendor:
  - OpenAI, Anthropic, Google, Meta, xAI, Mistral, Groq, Together.ai, Hugging Face Inference Endpoints.
- Sub-filters:
  - Architecture: `dense | moe`
  - Parameter count (ranges)
  - Context length (ranges)
- Dynamic metadata display panel (live on selection):
  - Layers (`N`)
  - Hidden dim
  - Attention heads
  - Expert count (MoE only)
  - Active experts per token / top-k (MoE only)
  - Position encoding scheme (RoPE / ALiBi / learned)
  - Context window
  - Estimated cost per 1M input/output tokens

#### 3.1.4 Inference Parameters
- `temperature` — slider, 0.0–2.0, step 0.05
- `top_p` — slider, 0.0–1.0, step 0.01
- `top_k` — integer input, 0–500 (0 = disabled)
- `max_tokens` — integer input, 1–context_length
- `seed` — integer input (where supported by vendor)
- `decoding_strategy` — selector: `greedy | nucleus | top_k | min_p`
- Parameter availability is gated by what the selected vendor/model supports (UI disables unsupported fields).

#### 3.1.5 Visualization Canvas (Main Pane)
**Split layout:**
- **Left pane:** live token stream as text, scrolling output, token-by-token highlighting.
- **Right pane:** 3D / 2D interactive visualization.

**3D Transformer Stack (Three.js):**
- Vertical stack of `N` layers where `N` comes from model metadata.
- Each layer lights up sequentially as token generation proceeds (paced to wall-clock).
- Layers are clickable; clicking zooms into sub-components:
  - RMSNorm (or LayerNorm)
  - Multi-Head Attention block (animated QKV projection, causal mask heatmap — illustrative)
  - Residual connection
  - FFN / MoE block
  - Residual connection
- For MoE models: router gate visualization (top-k experts highlighted with probability bars — simulated values driven by model metadata and a deterministic-from-seed PRNG).

**Token Flow Animation:**
- Tokens appear as glowing particles.
- Move through a PCA-reduced 3D embedding space (precomputed for common tokenizers, or a generic embedding cloud).
- Then traverse the layer stack.

**Attention Heatmap (D3.js):**
- Dynamic causal attention matrix per layer.
- Updated per generated token. Since no proprietary API exposes attention weights, this is an animated illustrative heatmap that responds to token-position and is seeded deterministically.

**MoE Routing Graph:**
- Shown only for MoE models.
- Bar chart of router scores; selected experts highlighted per token.
- Counter of expert utilization across the run.

**Logits & Decoding Panel:**
- Probability distribution bar for top-10 candidate tokens.
- Updated live where vendor returns `logprobs` (OpenAI, some Together endpoints); otherwise simulated based on the temperature/top-p settings.

**KV Cache Indicator:**
- Progress bar showing cached prefix length vs. total context.

#### 3.1.6 Controls
- Play / Pause
- Step-by-step mode (advance one token at a time)
- Speed multiplier: 0.5× / 1× / 2× / 4×
- Export current run as JSON
- Export current run as animated GIF
- Save run to history

#### 3.1.7 Threads / History Panel
- Two-level navigation: **Threads** list → **Runs within a thread**.
- Threads list shows: title, model(s) used, run count, last activity, total cost, tags.
- Within a thread: ordered list of runs (model, prompt preview, duration, token count, cost).
- Replay button per run — reanimates from stored token log without re-calling vendor API.
- Per-thread actions: rename, delete, archive, tag, export-as-JSON, fork (Phase 2).
- Per-run actions: replay, export-as-JSON, export-as-GIF, delete.

### 3.2 Backend Functionality

#### 3.2.1 Model Registry
Stored in SQLite via Eloquent ORM. Schema in §6.

Capabilities:
- CRUD via admin UI (admin role only).
- JSON import endpoint for bulk registry updates.
- Migration-seeded initial registry (§7).

#### 3.2.2 API Integration Layer (Guzzle HTTP Client)
- Unified `LlmClientInterface` with vendor-specific implementations.
- Implementations required for Phase 1:
  - `OpenAiClient`
  - `AnthropicClient`
  - `GoogleGeminiClient`
  - `XaiClient`
  - `MistralClient`
  - `GroqClient`
  - `TogetherClient`
  - `HuggingFaceClient`
- All clients support:
  - `stream(prompt, params): Generator<TokenChunk>` — server-side streaming via SSE/chunked.
  - `complete(prompt, params): Completion` — non-streaming fallback.
  - `countTokens(text): int` — vendor-specific or approximate BPE.
- API keys stored encrypted per user (Laravel encrypter).
- Per-user rate limiting (configurable, default e.g. 30 runs/hour).

#### 3.2.3 Visualization Orchestration

On submit:
1. Validate input (model exists, params within bounds, user has key for vendor).
2. Create `run` record (status = `pending`).
3. Dispatch streaming inference job.
4. For each received token chunk:
   - Parse delta.
   - Emit WebSocket event: `token_received` with `{ token, logprobs?, index, t }`.
   - Advance visualization state machine — emit derived events: `layer_advance`, `moe_route`, `attention_update`.
5. On completion: finalize `run` record with full token log, duration, total tokens, estimated cost.
6. On error: graceful degradation — partial visualization preserved, error surfaced to user.

The visualization state machine is **deterministic** given `(model_metadata, token_sequence, seed)` so replays are reproducible.

#### 3.2.4 Authentication & Authorization
- Laravel Sanctum for API token auth (no Fortify needed since no email/password flows).
- Social login *only* via Laravel Socialite: Google, Microsoft (via `socialiteproviders/microsoft`), Facebook.
- No email/password login. The `users.password` column is omitted entirely from the migration.
- Roles: `user`, `admin`.
- **Admin bootstrap:** No automatic promotion. After deployment, sysadmin SSH's to the VPS and runs `php artisan user:promote {email}` to promote a user to admin. The command refuses to run if the email is not yet registered.
- API key management page (per-vendor, encrypted at rest with Laravel encrypter).
- Rate limiting: per-user, admin-adjustable. Each `users` row has `max_runs_per_hour` (default `30`). Admin UI exposes a "users" table with an inline editor for this column. Middleware enforces via a sliding-window counter in Laravel cache.

### 3.3 Data Flow

```
[User] ── prompt + model + params ──▶ [Laravel Controller]
                                            │
                                            ▼
                                      validate + create run record
                                            │
                                            ▼
                                  [Service Layer / Vendor Client]
                                            │
                              streaming HTTP (SSE/chunked) via Guzzle
                                            │
                                            ▼
                                  [WebSocket broadcaster]
                                  (Pusher / Soketi / Laravel WebSockets)
                                            │
                                            ▼
                              [Frontend: Inertia + React]
                                            │
                                            ▼
                              Three.js + D3.js animation drivers
                                            │
                                            ▼
                                       [User screen]
```

On completion:
- Save full token log to `runs.token_log`.
- Compute summary stats: tokens/sec, total cost (using `models.pricing_per_million_tokens`).

### 3.4 Bring-Your-Own-Key (BYOK) Model
- BYOK only in Phase 1. Each user supplies their own vendor API keys, stored encrypted (Laravel encrypter, AES-256-CBC).
- The application charges nothing and has no billing infrastructure.
- Users see real-time cost estimates based on registry pricing data — informational only; vendors bill the user directly.
- A user with no key for the selected model's vendor is blocked at submit time with a clear "Add a key for {vendor} on the API Keys page" message.

### 3.5 Threads (Persistent Multi-Turn Conversations)
- A **thread** is an ordered collection of runs sharing a common system prompt and (typically) the same model.
- Users land on a thread list. "New Thread" creates an empty thread; each subsequent prompt within it is a new `run` appended to the thread.
- **Auto-titling:** a new thread's title is set to the first 60 characters of the first prompt (trimmed at word boundary, with `…` if truncated). No LLM call. Title is editable on the thread settings page.
- Each new run within a thread:
  - Inherits the thread's system prompt.
  - Pre-prepends all prior `(user, assistant)` turns from completed runs in the thread as conversation history sent to the vendor API.
  - Can override the model (per-run); doing so is allowed and recorded.
- Threads can be: renamed, deleted, archived, tagged, exported (whole thread as JSON).
- Replay of a single run inside a thread is supported and uses the original conversation context that was sent at the time of that run (snapshotted in `runs.conversation_history`).
- Context-window check: before submitting a new run, frontend tokenizer sums prior turns + new prompt; if ≥ 100% of context, submit is blocked with a "Trim or start a new thread" prompt.
- Phase 1 does **not** include thread branching/forking; threads are strictly linear.

### 3.6 Thread Sharing (Phase 1, opt-in)
- Each thread can be toggled to "shared" via a per-thread Share button.
- Enabling sharing generates a cryptographically-random `share_token` (32-char URL-safe) and stores it on the thread.
- A public route `/share/{share_token}` renders the thread in **read-only mode**:
  - All runs are visible (prompts, outputs, timings, costs).
  - **Replay is available** on shared runs (animation re-runs from stored `token_log`; no vendor API call needed).
  - **Submitting new runs is disabled.**
  - **API keys, user details, and the share-toggle UI are not exposed.**
- Disabling sharing nulls the `share_token`; previously-shared URLs return 404.
- If a thread contains runs where the owning user had `store_prompts = false`, those runs show `[prompt redacted by author]` in the shared view.
- Indexed by `share_token` for O(1) lookup. Share routes bypass auth middleware but are rate-limited by IP (60/min) to prevent token enumeration.
- Future: optional password-protected shares (Phase 2).

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Initial page load < 2 s on broadband; visualization sustains ≥ 30 FPS on mid-range laptop (e.g., 2020 MacBook Air, integrated GPU). |
| **Scalability** | 100 concurrent users on a DreamHost VPS. Inference compute is offloaded to vendor APIs; backend bottleneck is WebSocket fan-out + SQLite writes. |
| **Security** | API keys encrypted with Laravel encryptor (AES-256-CBC). Input sanitization. CSRF on all state-changing routes. Rate limiting per user + per IP. HTTPS only (HSTS). No prompt storage if user opts out (run record stores `prompt_hash` only). |
| **Accessibility** | WCAG 2.1 AA compliance. Keyboard navigation for all viz controls. ARIA labels on canvases. Reduced-motion alternative for users with `prefers-reduced-motion`. |
| **Browser support** | Chrome / Firefox / Edge latest two versions; Safari latest. WebGL 2.0 required for Three.js features (fallback message for unsupported browsers). |
| **Deployment** | Laravel 11, PHP 8.3+, Composer, SQLite. Shared hosting via Git push + Artisan; VPS via Laravel Forge-style scripts. No MySQL required. No Python required. |
| **Maintainability** | MVC structure, Eloquent models, service classes per vendor, dependency injection, PHPUnit + Pest tests, ≥ 70% coverage target on backend. |
| **Extensibility** | Model registry JSON import endpoint. Vendor client interface — adding a new vendor = implement `LlmClientInterface`. |
| **Observability** | Laravel Telescope (local), structured logs (JSON), error reporting via Sentry or Flare. |
| **i18n** | English only in Phase 1; structure code with `__('...')` calls to enable future translation. |

---

## 5. Technical Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 11 (PHP 8.3+) |
| Frontend | Inertia.js + React 18 |
| Build | Vite |
| Styling | Tailwind CSS 3 |
| 3D | Three.js r168 |
| 2D Viz | D3.js v7 |
| Graph (optional) | React Flow |
| Database | SQLite 3 |
| ORM | Eloquent |
| HTTP client | Guzzle 7 |
| WebSockets | Soketi (self-hosted on VPS, Pusher-protocol-compatible) — runs as a long-lived Node process under supervisor. Laravel broadcasts via the Pusher driver. |
| Auth | Laravel Sanctum + Socialite (Google / Microsoft / Facebook). No Fortify, no email/password. |
| Encryption | Laravel built-in encrypter (AES-256-CBC) |
| Testing (backend) | PHPUnit + Pest |
| Testing (frontend) | React Testing Library + Cypress E2E |
| GIF export | Server-side: ffmpeg shell-out from a queued job. Default frame source is **SVG/2D rendering** of the recorded token-log via PHP Imagick — no Chromium dependency. Optional **Puppeteer mode** can be enabled per-deployment (`GIF_RENDERER=puppeteer` in `.env`) for full 3D capture; requires Chromium install. See §10.6. |
| Errors | Sentry / Flare |
| Dev tooling | Laravel Pint, ESLint, Prettier, Husky pre-commit |

---

## 6. Database Schema

```sql
-- models table
CREATE TABLE models (
    id INTEGER PRIMARY KEY,
    vendor TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,                  -- canonical API name, e.g. "gpt-4o"
    display_name TEXT,
    api_base_url TEXT,
    architecture_type TEXT CHECK(architecture_type IN ('dense', 'moe')),
    layers INTEGER,
    hidden_dim INTEGER,
    attention_heads INTEGER,
    moe_experts INTEGER DEFAULT 0,
    moe_active_experts INTEGER DEFAULT 0,       -- top-k experts per token
    position_encoding TEXT,                     -- 'rope' | 'alibi' | 'learned'
    context_length INTEGER,
    pricing_input_per_million REAL,
    pricing_output_per_million REAL,
    supports_streaming BOOLEAN DEFAULT 1,
    supports_logprobs BOOLEAN DEFAULT 0,
    supports_seed BOOLEAN DEFAULT 0,
    supported_params JSON,                      -- {"temperature": true, "top_p": true, ...}
    chat_template TEXT,                         -- jinja2-ish template string
    created_at DATETIME,
    updated_at DATETIME
);

CREATE INDEX idx_models_vendor ON models(vendor);
CREATE INDEX idx_models_arch ON models(architecture_type);

-- users table (standard Laravel + extras)
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    email_verified_at DATETIME,
    -- no password column: social login only (Google/Microsoft/Facebook)
    avatar_url TEXT,
    role TEXT DEFAULT 'user',                   -- 'user' | 'admin'
    store_prompts BOOLEAN DEFAULT 1,            -- privacy opt-out flag
    max_runs_per_hour INTEGER DEFAULT 30,       -- per-user rate limit override
    remember_token TEXT,
    created_at DATETIME,
    updated_at DATETIME
);

-- social accounts
CREATE TABLE social_accounts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,                     -- 'google' | 'microsoft' | 'facebook'
    provider_user_id TEXT NOT NULL,
    created_at DATETIME,
    UNIQUE(provider, provider_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- per-user, per-vendor API keys (encrypted)
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    vendor TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    label TEXT,
    last_used_at DATETIME,
    created_at DATETIME,
    UNIQUE(user_id, vendor, label),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- threads table
CREATE TABLE threads (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT,                                 -- user-editable, default auto-generated from first prompt
    system_prompt TEXT,                         -- nullable; defaults applied at run time if null
    default_model_id INTEGER,                   -- preferred model for new runs in this thread
    default_parameters JSON,                    -- preferred params for new runs
    archived BOOLEAN DEFAULT 0,
    tags JSON,                                  -- ["learning", "moe-experiments", ...]
    share_token TEXT UNIQUE,                    -- nullable; non-null = thread is publicly viewable at /share/{token}
    share_enabled_at DATETIME,                  -- when sharing was last enabled (for audit)
    last_activity_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (default_model_id) REFERENCES models(id) ON DELETE SET NULL
);

CREATE INDEX idx_threads_share_token ON threads(share_token);

CREATE INDEX idx_threads_user ON threads(user_id);
CREATE INDEX idx_threads_activity ON threads(last_activity_at);

-- runs table
CREATE TABLE runs (
    id INTEGER PRIMARY KEY,
    thread_id INTEGER NOT NULL,                 -- every run belongs to a thread
    user_id INTEGER NOT NULL,                   -- denormalized for query speed
    model_id INTEGER NOT NULL,
    sequence_in_thread INTEGER NOT NULL,        -- 1-based ordinal within the thread
    prompt TEXT,                                -- nullable; null when user opts out
    prompt_hash TEXT NOT NULL,
    conversation_history JSON,                  -- snapshot of prior turns sent to vendor
    parameters JSON,                            -- {temperature, top_p, top_k, max_tokens, seed, model_snapshot}
    token_log JSON,                             -- [{token, logprobs?, t_ms, layer_state?}, ...]
    output_text TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    duration_ms INTEGER,
    tokens_per_second REAL,
    estimated_cost REAL,
    status TEXT DEFAULT 'pending',              -- 'pending' | 'streaming' | 'complete' | 'error'
    error_message TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id),
    UNIQUE(thread_id, sequence_in_thread)
);

CREATE INDEX idx_runs_thread ON runs(thread_id);
CREATE INDEX idx_runs_user ON runs(user_id);
CREATE INDEX idx_runs_created ON runs(created_at);
```

---

## 7. Initial Model Registry Seed Data

Seeded via migration. Subset of Phase 1 launch set:

| Vendor | Model | Architecture | Layers | Context | Notes |
|---|---|---|---|---|---|
| OpenAI | `gpt-4o` | dense* | ~120 (est.) | 128k | Architecture not public; layers field marked `estimated: true` |
| OpenAI | `gpt-4o-mini` | dense* | ~est. | 128k | Estimated |
| Anthropic | `claude-3-5-sonnet` | dense* | est. | 200k | Estimated |
| Anthropic | `claude-3-5-haiku` | dense* | est. | 200k | Estimated |
| Google | `gemini-1.5-pro` | MoE (rumored) | est. | 2M | Marked uncertain |
| xAI | `grok-2` | MoE | est. | 128k | Public sources |
| Meta | `llama-3.1-70b` | dense | 80 | 128k | Via Groq/Together |
| Meta | `llama-3.1-405b` | dense | 126 | 128k | Via Groq/Together |
| Mistral | `mixtral-8x22b` | MoE (8 experts, top-2) | 56 | 64k | Open weights |
| Mistral | `mistral-large` | dense | est. | 32k | |
| Groq | (proxies Llama-3, Mixtral) | passthrough | inherits | inherits | |
| Together.ai | (multiple) | passthrough | inherits | inherits | |
| HuggingFace | (user-supplied endpoint) | user-declared | user-declared | user-declared | |

Closed-source layer counts are marked `estimated: true` in the JSON and flagged in the UI.

### 7.1 Registry Refresh Strategy
- **Upstream:** OpenRouter `/api/v1/models` endpoint is the authoritative source for vendor coverage, model IDs, context lengths, and pricing.
- **Schedule:** A weekly scheduled job (`php artisan registry:refresh`) hits OpenRouter, diffs the response against the local `models` table, and upserts new or changed rows.
- **Architecture metadata enrichment:** OpenRouter does not expose layer count / hidden_dim / MoE structure. These fields are maintained in a checked-in PHP fixture file (`database/seeders/data/architecture_metadata.php`), keyed by model name. Refresh job joins OpenRouter rows with this fixture; gaps are filled with `estimated: true` placeholders that the admin can edit via the UI.
- **Fail-safe:** If OpenRouter returns malformed data or is unreachable, the job logs the failure, sends an admin notification, and leaves the existing `models` table untouched. A `registry_meta` row tracks `last_successful_refresh_at`. If this is more than **14 days** stale, the model selector UI surfaces a non-blocking banner: "Pricing data is N days stale — costs may be inaccurate".
- **Manual override:** Admin UI allows per-row edits; rows flagged `manual_override = true` are not touched by future automated refreshes.

Admin route: `POST /admin/registry/refresh` — manually triggers the same job out-of-schedule.

### 7.2 Vendor Coverage at Launch
All 9 vendors must have a working client at v1.0:
OpenAI, Anthropic, Google, xAI, Meta (via Groq/Together), Mistral, Groq, Together.ai, HuggingFace Inference Endpoints.

Per-vendor sign-off requires: streaming works, non-streaming fallback works, at least one model from that vendor is in the registry, and a manual end-to-end run completes with visualization advancing in real-time.

---

## 8. Limitations & Future Phases

### 8.1 Phase 1 limitations (called out to users in UI)
- Internals are metadata-driven animations only — no raw tensors.
- Attention heatmaps and MoE routing for proprietary models are illustrative, not actual.
- Animations for open-weights models (Llama, Mixtral) are also illustrative in Phase 1; tensor-accurate visualization requires a Python sidecar (Phase 2+).
- Cost estimates are based on registry pricing data and may lag vendor changes.
- Vendor API failures degrade gracefully — partial visualization preserved.

### 8.2 Future Phases
- **Phase 2:** Optional Python sidecar service (separately deployed, e.g., Modal / Replicate / RunPod) that runs open-weights models with tensor hooks; surfaces real attention and routing.
- **Phase 3:** Multi-user collaboration, shareable replay links, embeddable widgets.
- **Phase 4:** Educational mode with guided tours, comparison mode (run same prompt across N models).

---

## 9. Acceptance Criteria

A Phase 1 release is considered complete when all of the following pass:

1. A user can sign in via Google, Microsoft, or Facebook (no email/password fallback).
2. A user can add encrypted API keys for all 9 supported vendors.
3. A user can create a new thread and submit a first run.
4. A second run in the same thread is sent with the prior turn(s) as conversation history.
5. A user can select any registered model from the model picker and submit a prompt.
6. The visualization advances in real time, synchronized to the streamed token output.
7. For an MoE model, the router and expert-selection visualization is shown.
8. For a dense model, only the dense visualization is shown (no MoE artifacts).
9. A completed run is saved and can be replayed without re-calling the vendor API.
10. A run can be exported as JSON.
11. A run can be exported as an animated GIF (SVG renderer; Puppeteer renderer if configured).
12. A thread can be marked public; the `/share/{token}` URL renders read-only with replay enabled.
13. The application deploys cleanly to DreamHost VPS without Python dependencies.
14. WCAG 2.1 AA audit passes for the prompt-input, thread-list, and run-replay pages.
15. ≥ 30 FPS sustained on visualization canvas during a 100-token stream on a 2020-era laptop.
16. OpenRouter registry refresh job runs successfully on a schedule and updates pricing data.
17. `php artisan user:promote {email}` correctly promotes a registered user to admin.
18. Per-user rate limiting blocks the 31st run within a one-hour window for a user with `max_runs_per_hour = 30`.

---

## 10. Architecture Notes

### 10.1 Determinism
Replays must produce identical animations. State machine inputs:
- Model metadata (`models` row at run-time, stored snapshot in `runs.parameters.model_snapshot`).
- Token sequence (`runs.token_log`).
- Seed (`runs.parameters.seed`, falling back to `runs.id` if unset).

All simulated values (synthetic logprobs, attention heatmaps, MoE routing probabilities) are derived from a deterministic PRNG seeded with the above.

### 10.2 Streaming vs Polling
- **Primary:** WebSocket broadcasting via Soketi (self-hosted, Pusher-protocol-compatible). Soketi runs as a long-lived Node process under supervisor on the VPS. Laravel uses the Pusher broadcast driver pointed at the local Soketi host.
- **Fallback:** SSE direct from a Laravel `Symfony\StreamedResponse` proxy. Vendor stream chunks are written to the response body as they arrive via Guzzle's `Stream` option. Used when client cannot establish WebSocket (corporate firewall, etc.).
- **Channel model:** Each run gets a private channel `runs.{run_id}`. Frontend subscribes after receiving `run_id` from the submit response.

### 10.3 Cost / Token Estimation
- Input tokens counted before request via frontend BPE library (approximate).
- Output tokens counted from streamed response.
- Cost = `(input_tokens / 1e6 × pricing_input) + (output_tokens / 1e6 × pricing_output)`.
- Displayed live during streaming and stored on completion.

### 10.4 Privacy
- Users with `store_prompts = false` have `runs.prompt` and `runs.conversation_history` set to `null`. Only `prompt_hash` is retained, so replays still resolve to the same animation but the prompt text is unrecoverable.

### 10.6 GIF Export Pipeline
1. User clicks "Export GIF" on a completed run.
2. Job dispatched to queue (`ExportRunGif`).
3. Worker reads `runs.token_log` and `runs.parameters.model_snapshot`.
4. Worker invokes the configured renderer to produce a frame sequence (one frame per token-tick or one frame per N ms depending on configured speed):
   - **Default — SVG/2D renderer (`GIF_RENDERER=svg`):** PHP iterates the token log; for each frame, generates an SVG containing the 2D panels (token stream, attention heatmap, top-10 logits bar, MoE routing bars). Imagick rasterizes each SVG to PNG. **No 3D layer-stack in this mode** — a footer "2D summary view" label is included so users know they're not getting the full 3D capture.
   - **Optional — Puppeteer renderer (`GIF_RENDERER=puppeteer`):** Headless Chromium loads `/render/{run_id}?autoplay=1&record=1`, runs the live React+Three.js viz with deterministic seeding, and captures `canvas.toDataURL()` per frame. **Spawn-per-export lifecycle** — a Node child process is launched at job start, runs Chromium, captures frames, then exits. Cold-start ~3 s per export; idle RAM cost is zero between jobs. Adds ~150 MB Chromium dependency at install time. Recommended for deployments that prioritize export fidelity over footprint.
5. Worker shells out to `ffmpeg` **twice from the same frame sequence** — once for animated GIF, once for MP4 (H.264). Both are always produced; storage cost is small relative to rendering cost.
6. Results stored at `storage/app/exports/{run_id}.gif` and `storage/app/exports/{run_id}.mp4`. Both download URLs surfaced via the WebSocket completion event so the user picks.
7. Renderer mode is checked at boot; if `puppeteer` is configured but Chromium is missing, the system logs a warning and falls back to SVG with a "fallback engaged" badge on the resulting export.

### 10.7 Failure Modes
| Failure | Behavior |
|---|---|
| Vendor API 4xx (auth) | Surface "Invalid API key for vendor X" to user; mark run `error`. |
| Vendor API 5xx | Retry with exponential backoff (max 2). If still failing, mark `error`, preserve partial token log. |
| WebSocket disconnect mid-stream | Frontend reconnects; resumes from `runs.token_log` cursor. |
| Rate limit hit | 429 surfaced to user with retry-after hint. |
| Browser tab backgrounded | Animation pauses; resumes on focus. |

---

## 11. Open Questions

### 11.1 Resolved (2026-05-17)
- ~~Hosting tier~~ → **DreamHost VPS** (persistent processes OK, ffmpeg available).
- ~~Auth providers~~ → **Google + Microsoft + Facebook**, no email/password.
- ~~Key model~~ → **BYOK only**, no billing infrastructure.
- ~~GIF export pipeline~~ → **Server-side ffmpeg** via queued job. **Default renderer is SVG/2D**; Puppeteer is opt-in per deployment (`GIF_RENDERER=puppeteer`).
- ~~WebSocket implementation~~ → **Soketi self-hosted** on the VPS (Pusher-protocol-compatible).
- ~~Frontend tokenizer~~ → **tiktoken-js for OpenAI**, generic BPE approximation for all other vendors (with `~` tooltip indicator).
- ~~Registry source~~ → **OpenRouter API as upstream**, weekly refresh, manual override allowed.
- ~~Conversation persistence~~ → **Persistent threads** (chat-history UX, linear only — no branching in Phase 1).
- ~~Vendor coverage~~ → **All 9 vendors at launch**.
- ~~Admin bootstrap~~ → **Artisan command** `php artisan user:promote {email}` after first login.
- ~~Rate limiting~~ → **Per-user, admin-adjustable** via `users.max_runs_per_hour`, default 30.
- ~~Thread sharing~~ → **In Phase 1, opt-in per thread**, read-only public view at `/share/{token}`.
- ~~Pricing fail-safe staleness banner~~ → **Show after 14 days** without successful OpenRouter refresh.

### 11.2 Resolved tactical decisions (2026-05-17)
- ~~Default viz speed~~ → **1× on load**, controls toolbar exposes 0.5× / 1× / 2× / 4×. Per-user preference saved to localStorage.
- ~~Puppeteer lifecycle~~ → **Spawn per export.** Cold-start ~3 s per export; releases all RAM between jobs. Better fit for a memory-constrained VPS. Only relevant if `GIF_RENDERER=puppeteer` is set.
- ~~Export formats~~ → **Both animated GIF and MP4 produced from a single frame sequence.** ffmpeg does both in one job; the user downloads whichever they prefer.
- ~~Thread auto-titling~~ → **First 60 characters of the first prompt.** No LLM call. Title is editable on the thread settings page. Phase 2+ may add an optional "auto-title via LLM" button.

### 11.3 Still open
*(None at present.)*

---

## 12. Appendix: Glossary

- **MoE (Mixture of Experts):** Architecture where each token is routed to a subset (top-k) of expert FFN sub-networks rather than the full FFN. Mixtral-8x22B has 8 experts, top-2 active per token.
- **RoPE (Rotary Position Embedding):** Position encoding used in Llama, Mistral, most modern open models.
- **ALiBi:** Attention with Linear Biases — alternative position encoding.
- **BPE (Byte-Pair Encoding):** Tokenization scheme.
- **SSE (Server-Sent Events):** HTTP streaming protocol used by OpenAI and most vendors for token streaming.
- **KV cache:** Cached key/value tensors from prior tokens, avoids recomputation during autoregressive decoding.
- **BYOK:** Bring Your Own Key — users supply their own vendor API keys.
