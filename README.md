# LLM-Viz — LLM Process Visualizer

> Interactive, real-time visualization of LLM inference internals. Submit a prompt, pick a model, and watch the generation pipeline animate token by token.

**Status:** Pre-implementation. Specification and execution plan complete. Code scaffolding has not begun.
**Domain:** [llm.trackr.live](https://llm.trackr.live) (not yet live)

---

## What it does

LLM-Viz lets users submit a prompt to any of the major LLM vendors (OpenAI, Anthropic, Google, xAI, Meta-via-Groq/Together, Mistral, Groq, Together.ai, HuggingFace) and watch an animated visualization of the inference pipeline — tokenizer → embeddings → transformer layers → MoE routing (for MoE models) → logits → decoding — synchronized to the real token stream from the vendor's API.

It is designed for **researchers, educators, developers, and enthusiasts** who want intuition for how LLMs generate text without needing local GPU infrastructure.

### What it is *not*
- Not a model-hosting platform — inference happens on vendor APIs (BYOK).
- Not a tensor inspector — visualizations are illustrative, paced to real token-generation timing. (A future phase adds real tensor capture for open-weights models via a separate Python sidecar — see [`docs/phase2.md`](docs/phase2.md).)
- Not a fine-tuning or training tool.

---

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Laravel 13, PHP 8.4+, SQLite |
| Frontend | Inertia.js + React 19 + TypeScript, Vite, Tailwind CSS 3 |
| Visualization | Three.js (3D layer stack, token flow), D3.js (heatmaps, logits, MoE routing) |
| Realtime | Soketi (self-hosted, Pusher-protocol-compatible) |
| Auth | Laravel Sanctum + Socialite (Google / Microsoft / Facebook social login only) |
| Vendor HTTP | Guzzle 7 |
| Hosting | DreamHost VPS |
| Testing | Pest (PHP), React Testing Library, Cypress |

Full details in [`SPEC.md`](SPEC.md).

---

## Documentation

| Document | What's in it |
|---|---|
| [`SPEC.md`](SPEC.md) | Authoritative specification: requirements, architecture, schema, acceptance criteria. |
| [`docs/PLAN.md`](docs/PLAN.md) | Execution roadmap across all phases. |
| [`docs/phase1.md`](docs/phase1.md) | Detailed milestone breakdown for the launch product (14 milestones). |
| [`docs/phase2.md`](docs/phase2.md) | Future: Python sidecar for tensor-accurate visualization of open-weights models. |
| [`docs/phase3.md`](docs/phase3.md) | Future: multi-user collaboration, organizations, shared sessions. |
| [`docs/phase4.md`](docs/phase4.md) | Future: education mode and side-by-side model comparison. |

---

## Quick start (once code exists)

> The project is not scaffolded yet. The commands below describe the intended workflow once Milestone M1 of Phase 1 completes.

### Prerequisites
- PHP 8.4+
- Composer 2.x
- Node 20+
- SQLite 3
- (Optional, for realtime) Soketi via Docker

### Install
```bash
git clone git@github.com:CyberSecDef/llm.trackr.live.git
cd llm.trackr.live
composer install
npm install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
```

### Run dev
```bash
# Terminal 1 — Laravel
php artisan serve

# Terminal 2 — Vite
npm run dev

# Terminal 3 — Queue worker
php artisan queue:work

# Terminal 4 — Soketi (or use Docker)
soketi start
```

Visit `http://localhost:8000`, sign in with a social provider configured in `.env`, add an API key for any supported vendor, and create a thread.

### Promote yourself to admin
```bash
php artisan user:promote you@example.com
```

---

## Project organization

```
.
├── README.md              ← you are here
├── SPEC.md                ← authoritative spec
├── docs/
│   ├── PLAN.md            ← cross-phase execution plan
│   ├── phase1.md          ← active phase, detailed milestones
│   ├── phase2.md          ← future: Python sidecar
│   ├── phase3.md          ← future: collaboration
│   └── phase4.md          ← future: education + comparison
└── ... (Laravel scaffold to be added in M1)
```

---

## Contributing

The project is in pre-implementation planning; external code contributions aren't being accepted yet. Issues, design feedback, and discussion are welcome via GitHub Issues. A `CONTRIBUTING.md` will appear before the M1 scaffold lands.

## License

Licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0). See [`LICENSE`](LICENSE) for the full text.

The AGPL is a strong copyleft license: if you run a modified version of LLM-Viz as a network service, you must make your modifications available to users of that service under the same license. This is intentional — it lets others self-host or fork while preventing closed-source SaaS clones.
