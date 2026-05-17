# LLM-Viz Execution Plan

**Project:** LLM Process Visualizer (LLM-Viz)
**Repository:** `CyberSecDef/llm.trackr.live`
**Domain:** llm.trackr.live
**Authoritative spec:** [`/SPEC.md`](../SPEC.md)
**Plan revised:** 2026-05-17

---

## 1. Purpose of this document

`PLAN.md` is the **execution roadmap**. It explains how we get from an empty repository to a launched product, how the work is decomposed into phases, and what the dependencies are between phases. Detailed work breakdowns for each phase live in the per-phase documents:

- [`phase1.md`](phase1.md) — Launch product. Currently active.
- [`phase2.md`](phase2.md) — Optional Python sidecar for tensor-accurate visualization of open-weights models.
- [`phase3.md`](phase3.md) — Multi-user collaboration and enhanced sharing.
- [`phase4.md`](phase4.md) — Educational mode and cross-model comparison.

Anything in this file that contradicts `SPEC.md` is wrong — fix it here, not there. `SPEC.md` is the source of truth for *what we are building*; `PLAN.md` is the source of truth for *how and when*.

---

## 2. Phase summary

| Phase | Goal | Status | Depends on | Detailed doc |
|---|---|---|---|---|
| **Phase 0** | Project planning + spec freeze | ✅ Complete | — | This file + `SPEC.md` |
| **Phase 1** | Launch product: 9 vendors, threads, viz, replay, export, sharing | 🟡 Not started | Phase 0 | [`phase1.md`](phase1.md) |
| **Phase 2** | Python sidecar service for real tensor capture on open-weights models | ⚪ Future | Phase 1 launched + traction | [`phase2.md`](phase2.md) |
| **Phase 3** | Multi-user collaboration, real-time co-viewing, organization accounts | ⚪ Future | Phase 1 launched + user demand | [`phase3.md`](phase3.md) |
| **Phase 4** | Educational mode (guided tours, lessons) and comparison mode (run N models side-by-side) | ⚪ Future | Phase 1 launched | [`phase4.md`](phase4.md) |

Phases 2, 3, and 4 are **parallel candidates** post-launch — they have no inter-dependency. Their ordering depends on which problem proves most valuable after Phase 1 ships.

---

## 3. Phase 1 milestones (overview)

Phase 1 is split into 14 milestones (M1–M14) with explicit dependencies. The full breakdown — task lists, acceptance criteria, owner placeholder, time estimates — lives in [`phase1.md`](phase1.md).

```
M1  Foundation
  └─▶ M2  Auth + Users
        └─▶ M3  Model Registry ──┐
        └─▶ M4  API Keys + Vendor Clients ──┐
                                            ├─▶ M5  Threads + Runs
                                            │      └─▶ M6  Realtime + Streaming
                                            │            └─▶ M7  Frontend (static)
                                            │                  └─▶ M8  Frontend (live viz)
                                            │                        └─▶ M9  Replay + JSON Export
                                            │                              └─▶ M10 GIF Export
                                            │                                    └─▶ M11 Sharing
                                            │                                          └─▶ M12 A11y + Polish
                                            │                                                └─▶ M13 Deployment
                                            │                                                      └─▶ M14 Launch Prep
```

M3 and M4 can run in parallel. Everything else is sequential because the visualization layer depends on real streaming events flowing end-to-end.

**Critical path:** M1 → M2 → M4 → M5 → M6 → M7 → M8 → M14. Anything that delays the critical path delays launch.

---

## 4. Vertical-slice milestone (the "first demo")

Before reaching M14, there is an implicit **Vertical Slice** target at the end of M8: a single-vendor (OpenAI), single-model (gpt-4o), single-user end-to-end demo with the visualization running. This is the first point at which the product is *recognizable* and is the gate for go/no-go on the rest of Phase 1.

If the vertical slice is reached and the visualization either looks wrong or doesn't sync convincingly to the token stream, **stop and re-evaluate the visualization approach before continuing** rather than building out 8 more vendor integrations against a viz layer that doesn't work.

---

## 5. Definition of done (Phase 1)

A Phase 1 release is launchable when all 18 acceptance criteria in [`SPEC.md` §9](../SPEC.md#9-acceptance-criteria) pass. Summarized:

- Social auth works for all 3 providers.
- All 9 vendors stream tokens end-to-end and animate the viz in real time.
- MoE-aware visualization for MoE models.
- Threads persist, replay, export (JSON + GIF), and share.
- Deploys to DreamHost VPS without Python dependencies.
- WCAG 2.1 AA passes for core flows.
- 30 FPS sustained, 100 concurrent users handled.
- OpenRouter registry refresh + `user:promote` + rate-limiting all verified.

---

## 6. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vendor API changes mid-build (OpenAI deprecates a field, etc.) | High | Medium | Abstract behind `LlmClientInterface`; integration tests pinned to recorded fixtures, smoke tests against live APIs in CI nightly. |
| Visualization looks "fake" because internals are metadata-driven | High | High | Be explicit in UI that animations are illustrative when no logprobs/attention available. Vertical-slice gate (§4) catches this early. |
| Soketi instability under load | Medium | High | Load-test in M6; have SSE fallback already implemented as primary alternative, not as future-work. |
| OpenRouter pricing drift | Medium | Low | Weekly refresh + 14-day staleness banner. Documented in §10.4 of SPEC. |
| DreamHost VPS quirks (PHP version pinning, supervisor limitations) | Medium | High | Provision a staging VPS in M1, deploy a "hello world" Laravel app to it before any feature work. |
| Three.js performance on integrated GPUs | Medium | Medium | Frame-budget testing in M8. LOD (level-of-detail) for layer stack on lower-end hardware. |
| GIF export hangs on long runs (>500 tokens) | Medium | Medium | Queue with timeout. Default to MP4 internally and convert to GIF only if requested; offer MP4 to user as alternate format. |
| Token-count drift between tiktoken-js (frontend estimate) and OpenAI's actual count | Low | Low | Show estimate as "~" prefix; reconcile after run with vendor-reported usage. |
| Phase 1 scope creep (e.g., adding branching threads, embeddable widgets) | High | High | Strict adherence to SPEC §2.2 "out of scope" list. Anything new goes to Phase 3/4 docs, not Phase 1. |

---

## 7. Tooling and engineering practices

These apply across all phases.

- **Branching:** Trunk-based with short-lived feature branches. `main` is always deployable. PRs require green CI.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) — enables changelog generation and clear history.
- **Code style:** Laravel Pint (PHP), ESLint + Prettier (JS/TS). Pre-commit hook via Husky enforces formatting.
- **Testing:** Pest for PHP (unit + feature). React Testing Library for components. Cypress for E2E. Target: ≥ 70% backend coverage; visual regressions caught by Cypress screenshot diffs on the viz canvas.
- **CI:** GitHub Actions runs lint + tests on every PR; nightly job runs smoke tests against live vendor APIs using a dedicated CI test account.
- **Deployment:** GitHub Actions deploys to staging on merge to `main`; tag-triggered deploy to production (`v1.0.0`, etc.).
- **Observability:** Sentry (or Flare) for errors, Laravel Telescope for local debugging, structured JSON logs in production.
- **Security:** `composer audit` and `npm audit` in CI. Dependabot enabled. Secrets via `.env`, never committed. Per-PR security review for any change touching auth, encryption, or share-link routes.

---

## 8. Documentation that will exist by launch

| Document | Purpose | When written |
|---|---|---|
| `SPEC.md` | What we're building (requirements + architecture). | Phase 0 ✅ |
| `docs/PLAN.md` | This file. | Phase 0 ✅ |
| `docs/phase1.md` — `phase4.md` | Per-phase breakdowns. | Phase 0 ✅ (phase1 fleshed; phases 2-4 outline only) |
| `README.md` | Public-facing project intro + quick start. | Phase 0 ✅ |
| `docs/architecture.md` | Diagrams, sequence flows, deeper than SPEC. | M6 |
| `docs/api.md` | Internal HTTP/WS API reference. | M9 |
| `docs/deployment.md` | DreamHost VPS provisioning, prod + staging on a single VPS, supervisor configs, Let's-Encrypt direct (no Cloudflare). | M13 |
| `docs/user-guide.md` | End-user docs (how to use the app). | M14 |
| `docs/admin-guide.md` | Admin tasks: registry refresh, user promotion, rate limits. | M14 |
| `CHANGELOG.md` | Per-release notes. | Starting at M14 / v1.0 |
| `CONTRIBUTING.md` | If/when external contributors are invited. | Post-launch |
| `LICENSE` | TBD — see open questions §10. | Before public push |

---

## 9. Cadence and time-boxing

Per-milestone time estimates appear in [`phase1.md`](phase1.md). They are estimates, not commitments. A milestone running 50% over its estimate is a yellow flag; 100% over is a red flag and triggers a re-scope conversation rather than a deadline slip.

No fixed release date is committed in Phase 0. A target date will be set at the end of M6 once the streaming pipeline is proven and the remaining scope is concrete.

---

## 10. Open planning questions

### 10.1 Resolved (2026-05-17)
- ~~License~~ → **AGPL-3.0.** Strong copyleft. Anyone running a modified version as a service must publish their changes. `LICENSE` file added at the repo root (canonical FSF text).
- ~~Repo visibility~~ → **Public from day one.** GitHub Actions minutes are unlimited on public repos; work happens in the open.
- ~~Staging environment~~ → **`staging.llm.trackr.live` subdomain on the production VPS.** Shared resources; acceptable for launch-scale traffic.
- ~~Pre-launch beta~~ → **Straight to public at v1.0.** No invitation/waitlist system needed. M14 includes a "soft" launch checklist but no gating UI.
- ~~CDN / DDoS~~ → **No Cloudflare; direct to VPS.** SSL via Let's Encrypt directly on DreamHost VPS. Simplest path; revisit if traffic warrants it.

### 10.2 Still open
*(All planning-level questions resolved. Anything that comes up will be added back here.)*
