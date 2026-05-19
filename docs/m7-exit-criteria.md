# M7 Exit Criteria — Manual Verification Recipes

The three criteria from `docs/phase1.md` are covered at the unit/integration level by
the test suite (a full Pest controller surface + Vitest page tests, totalling 512 +
181 cases at M7 close). These recipes verify the same things through a real browser
against a live stack — useful as a smoke test before M8 starts layering the real
visualization on top of this UI.

Prereqs:
- Auth: either the OAuth providers are wired (Google / Microsoft / Facebook) in
  `.env`, or use `php artisan dev:login <email>` to issue a magic link (M2 + dev-login
  tooling, see `app/Console/Commands/DevLoginCommand.php`).
- A user exists with at least one API key for a vendor whose models live in the
  registry. Without a key the prompt-input footer shows its "Add an API key" empty
  state, which is by design but blocks the streaming criterion.
- A model row in `models` whose `vendor` matches one of the user's API keys.

## Stack to bring up

```
php artisan serve --host=0.0.0.0 --port=8001       # HTTP
php artisan reverb:start --host=0.0.0.0            # WebSocket (or use SSE fallback)
php artisan queue:work --tries=1 --timeout=600     # Picks up StreamRunJob
npm run build                                      # or `npm run dev` for HMR
```

`BROADCAST_CONNECTION=reverb` in `.env` if you want the WebSocket path; otherwise the
chunk-5b SSE fallback will engage automatically.

---

## Criterion 1 — All pages render and route correctly

**Recipe:**
1. Log in.
2. Click each sidebar entry in order: **Dashboard → Threads → Models → API Keys →
   Settings**. Admin users also visit **Admin · Users** and **Admin · Models**.
3. From the threads list, **Create thread** → land on the empty thread detail page.
4. Click **All threads** to return.
5. Hit an unknown URL like `/threads/9999999` to verify the 404 page.

**Expected:**
- Every page renders without a 500.
- Each page's top-bar title (mobile) or breadcrumb reflects the current section.
- Sidebar navigation highlights the active item.
- `/threads/9999999` returns the chunk-2 `NotFound` page (or the dev whoops with stack
  trace if `APP_DEBUG=true`; the React error page lands when debug is off).

**Pass criterion:** no broken routes; every nav target loads with status 200.

---

## Criterion 2 — Full submit → live stream flow

**Recipe:**
1. **Create a thread** from `/threads` (or the dashboard's empty-state CTA).
2. On the thread detail page:
   - Type a prompt that will generate visible output (e.g. "Write a 4-line haiku
     about gradient descent").
   - Pick a model in the **ModelPicker** (chunk-7 combobox); try the arch filter
     toggle + the vendor chip filter; confirm the **ModelMetadataCard** below
     updates as you switch models.
   - Expand the **Parameters** card (chunk-8); slide temperature, watch the
     custom-dot toggle on the header.
   - As you type, the **token-count + budget bar** under the textarea (chunk-6a)
     should update on a ~400ms debounce. Push the prompt long enough to drive the
     bar amber (≥80%), then over the context length to drive it red — submit
     should disable while over budget.
3. Trim the prompt back under-budget and **Submit**.

**Expected:**
- Page redirects (Inertia partial reload) back to `/threads/{id}` with the new run
  added to the transcript in `pending` status.
- The right-pane **LiveStreamPane** (chunk-6b) wires up via `useRunStream`, the
  transport label reads `WebSocket` or `SSE (fallback)`, and event JSON appears as
  tokens arrive.
- When the run terminates (complete or errored), the page auto-refreshes the
  transcript so the final `output_text` + token counts + cost are visible.

**Pass criterion:** tokens stream into the right pane within ~1s of dispatch; final
output ends up in the transcript card matching what the vendor delivered.

---

## Criterion 3 — Lighthouse score ≥ 90 on the dashboard

**Recipe:**
1. Open the dashboard in Chrome/Edge: `/dashboard`.
2. DevTools → Lighthouse → check **Performance** + **Accessibility** + **Best
   practices** + **SEO** (mobile or desktop preset, your choice).
3. Run.

**Expected:**
- Performance ≥ 90 (dashboard is server-rendered Inertia; minimal client work).
- Accessibility ≥ 90 (shadcn primitives carry their Radix a11y defaults: focus
  rings, ARIA roles, sr-only labels on the mobile-nav Sheet header).
- Best practices ≥ 90.
- SEO bucket isn't load-bearing for an authenticated app; skim for blockers but
  don't gate on it.

**Pass criterion:** all three performance / accessibility / best-practices buckets
≥ 90.

If accessibility falls below 90, M12 (Accessibility + Polish) is the natural place
to address it — file the findings as M12 work rather than blocking M7 close.

---

## Negative-path sanity checks

Quick sanity passes worth running once:

- **No API key:** delete all your keys via `/api-keys`, visit a thread. The prompt
  footer shows the amber "Add an API key" callout linking to `/api-keys`.
- **No usable models:** add a key for a vendor not in the registry (or delete the
  matching model rows from `/admin/models`). Thread page shows the "registry has
  no models for your vendor" hint.
- **Archive/unarchive flow:** archive a thread from its detail page; confirm it
  disappears from the default `/threads` list, appears under the "Archived" tab.
- **Delete a thread with runs:** confirm via the AlertDialog. After redirect to
  `/threads`, the thread is gone AND its runs are also deleted (`runs` table FK
  cascade — chunk-5 invariant).
- **Mobile nav:** narrow the viewport below `md` (768px); sidebar collapses; hit
  the hamburger to confirm the Sheet drawer opens with the same nav links.
- **Empty-state CTAs:** on a fresh user (no keys, no threads), every page should
  show its empty state with a working "Set up your first API key" or "Start a
  thread" link. No dead-ends.
