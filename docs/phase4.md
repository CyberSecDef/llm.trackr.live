# Phase 4 — Education Mode and Comparison Mode

**Goal:** Turn the visualization tool into an active teaching platform with guided tours, structured lessons, and the ability to run the same prompt against multiple models simultaneously for side-by-side comparison.

**Status:** Outline only. This is the lowest-priority of the future phases and may be re-prioritized after Phase 1 if education turns out to be the primary use case.

**Prerequisite:** Phase 1 launched. Phase 2 helpful but not required (tensor accuracy makes lessons more compelling, but the illustrative view is sufficient).

---

## 1. Why this is a separate phase

Phase 1's tool is *exploratory* — users come with their own questions. Phase 4 is *pedagogical* — the tool guides users through pre-built lessons. These are different products built on the same engine.

Comparison mode is a different beast: running N inferences in parallel and synchronizing N visualizations multiplies the complexity of the streaming layer, the viz layout, and the cost-tracking UI.

Both features are "force multipliers" on the existing tool but require non-trivial new UX.

---

## 2. Scope

### Education mode

- **Guided tours:** Interactive walkthroughs that pause the viz at specific points and explain what's happening ("This is the attention block. Click the highlighted layer to zoom in.").
- **Lesson library:** Curated lessons by topic — "Tokenization 101", "How attention works", "Why MoE is efficient", "What top-p does", etc.
- **Lesson authoring tools:** Admin UI to create lessons (waypoints, annotations, suggested prompts, suggested models).
- **Progress tracking:** Users complete lessons; their progress is saved.
- **Quizzes (optional):** Knowledge checks between waypoints.
- **Lesson sharing:** Educators can publish lessons publicly.
- **Embeddable widget:** Lessons embeddable on third-party sites via iframe.

### Comparison mode

- **Side-by-side runs:** Submit one prompt → fan out to 2–4 selected models → run in parallel → display N viz panels.
- **Synchronized playback:** Pause/play affects all panels together; per-panel detail is still inspectable.
- **Diff view:** Token-by-token comparison of outputs across models.
- **Cost / speed scorecards:** Per-model summary (tokens/sec, total cost, completion time).
- **Saved comparisons:** Treated as a new entity type — `comparisons` — separate from threads but exportable similarly.

---

## 3. Architectural changes

### Schema additions
- `lessons` (id, title, slug, author_id, body, published_at, ...)
- `lesson_waypoints` (lesson_id, sequence, annotation_text, viz_pause_state, ...)
- `lesson_progress` (user_id, lesson_id, last_waypoint, completed_at)
- `comparisons` (id, user_id, prompt, model_ids JSON, runs JSON, created_at)

### Frontend changes
- Tour engine: a state machine that overlays explanations and controls the viz remotely. Likely React Joyride or Shepherd.js.
- Grid layout for comparison mode (2x1, 2x2, 1x3 depending on N).
- Performance work: rendering N Three.js scenes simultaneously requires either (a) instanced scenes in one renderer or (b) careful WebGL context management.

### Realtime
- Comparison mode: each fanned-out run gets its own `runs.{id}` channel; the comparison page subscribes to N channels in parallel.

---

## 4. Milestones (sketch, ~6 weeks)

| # | Milestone | Notes |
|---|---|---|
| P4-M1 | Tour engine | Integrate React Joyride or build custom. Hook into viz state. |
| P4-M2 | Lesson data model + 5 hand-written lessons | Internal authoring via Markdown + JSON, no admin UI yet. |
| P4-M3 | Lesson UI | Browse → start → complete flow. Progress tracking. |
| P4-M4 | Lesson authoring tool | Admin UI for creating new lessons. |
| P4-M5 | Comparison data model | Fan-out logic, parallel run orchestration. |
| P4-M6 | Comparison UI | Grid layout, synchronized controls, diff view. |
| P4-M7 | Embeddable widget | iframe-friendly lesson view with reduced chrome. |

---

## 5. Open questions for Phase 4

- **Lesson content authorship:** In-house only, community-contributed, or both? Community implies moderation infrastructure.
- **Embeddable widget security:** CSP, iframe sandboxing, attribution requirements?
- **Performance:** Rendering 4 Three.js scenes on a single GPU — does the 30 FPS budget from Phase 1 still hold? Likely need to drop to 15 FPS or simplify scenes in comparison mode.
- **Cost in comparison mode:** Running the same prompt across 4 models bills 4× — UX needs to make this very clear before submit.
- **Lesson scoring:** If quizzes exist, do we want to gamify (leaderboards, badges) or keep it educational-only?
- **Translation:** Lessons in English only, or build i18n into the lesson schema from day one?

---

## 6. Success criteria

- A user with no LLM background can complete the "Tokenization 101" lesson and answer a quick knowledge check correctly.
- A user can run "Explain quantum entanglement" against GPT-4o, Claude-3.5-Sonnet, Mixtral, and Llama-3.1-70B in parallel and see synchronized side-by-side animations.
- An educator can author a new lesson in under 2 hours using the admin UI.
- An iframe embed of a lesson works on at least 3 popular blog/CMS platforms.
