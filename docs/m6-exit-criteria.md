# M6 Exit Criteria — Manual Verification Recipes

The three exit criteria from `docs/phase1.md` are verified by the test suite at the
unit/integration level (token-emission, transport fallback, channel auth). These
recipes exercise them end-to-end through a real browser against a live stack —
useful as a smoke test before M7 starts adding UI on top of this plumbing, and
as the manual test plan referenced in the M6 retrospective.

Prereqs:
- `.env` has `BROADCAST_CONNECTION=reverb` (default `.env` ships with `log`,
  which logs broadcasts instead of firing them — useful for dev sanity-checks
  but won't satisfy any of the criteria below).
- A user exists with an API key for at least one vendor (use
  `php artisan dev:login user@example.com` if OAuth isn't configured).
- A model row in the registry whose vendor matches the API key.

## Stack to bring up

Four processes. Run each in its own terminal (or use `php artisan serve` +
the supervisor stubs in `deployment/supervisor/`):

```
php artisan serve --host=0.0.0.0 --port=8001       # HTTP
php artisan reverb:start --host=0.0.0.0            # WebSocket broadcaster
php artisan queue:work --tries=1 --timeout=600     # Picks up StreamRunJob
npm run dev                                        # Vite HMR (or `npm run build`)
```

Browse to `http://localhost:8001` (or the LAN IP for phone testing).

---

## Criterion 1 — Tokens stream to the debug page within ~200 ms of vendor delivery

**Recipe:**
1. Log in.
2. Submit a run via `tinker`:
   ```php
   $user = App\Models\User::firstWhere('email', 'you@example.com');
   $model = App\Models\LlmModel::firstWhere('vendor', 'openai');
   $thread = $user->threads()->create();
   $run = app(App\Services\Threads\RunService::class)->submit(
       $user, $thread, $model, 'Count to 5 in English.', ['max_tokens' => 50],
   );
   App\Jobs\StreamRunJob::dispatch($run);
   echo $run->id;
   ```
3. Navigate to `/runs/{id}/debug` in the browser.
4. Watch the event-stream pane.

**Expected:**
- `run.started` lands within ~1 s of dispatch (queue worker pickup latency).
- `token.received` events arrive in sequence with sub-second tail latency
  per token.
- `run.completed` closes the stream when the vendor finishes.
- The transport label reads `WebSocket`.

**Pass criterion:** time between the queue worker logging "Processed: StreamRunJob"
and the first `token.received` frame visible on the debug page is < 200 ms.

---

## Criterion 2 — Killing Reverb mid-stream falls back to SSE without dropping tokens

**Recipe:**
1. Dispatch a long-running run (use a prompt that generates ≥ 30 tokens, like
   "Write a 200-word poem about gradient descent").
2. While tokens are streaming, in another terminal: `kill -9 $(pgrep -f
   reverb:start)`.
3. Watch the debug page's transport label.

**Expected:**
- Within a few seconds of the kill, the transport label flips from `WebSocket`
  to `SSE (fallback)`.
- The event list briefly resets (chunk 5b clears on transport change), then
  refills from cursor 0 via the SSE controller's replay.
- Streaming resumes — new tokens continue arriving via SSE.
- `run.completed` fires when the vendor finishes.

**Pass criterion:** no `token.received` frame is permanently lost. The final
`output_text` in `runs` table matches the full assistant reply.

---

## Criterion 3 — Multiple tabs subscribing to the same `runs.{id}` channel receive identical events

**Recipe:**
1. Open `/runs/{id}/debug` for the same run ID in two browser tabs.
2. Dispatch the run (or start it before opening tabs — both work; SSE replay
   handles the late-joiner).
3. Diff the two event lists side-by-side after the run completes.

**Expected:**
- Both tabs receive every event.
- Event order is identical between tabs (broadcasting fan-out is deterministic
  per Reverb's pubsub layer).
- Both tabs land on `status: complete` with the same final `output_text`.

**Pass criterion:** the event lists are identical event-for-event.

---

## Negative-path sanity checks

These don't satisfy a positive exit criterion but are worth running once before
shipping:

- **Wrong-user channel auth:** log in as user A, manually visit `/runs/{B's
  run id}/debug`. Should return 403.
- **Run errored mid-stream:** force an invalid API key, dispatch a run. Debug
  page should show `run.errored` with `status: errored`, and `output_text`
  populated with whatever the vendor delivered before failing.
- **Transient WS blip:** open Chrome DevTools, throttle network to "Offline"
  for 5 s, then back to "No throttling". Pusher reconnects; the hook fires
  the chunk-6 backfill against `GET /runs/{id}/events?since=N`. No tokens
  should be missing in the debug list when the run completes.
