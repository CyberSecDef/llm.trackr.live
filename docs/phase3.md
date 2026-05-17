# Phase 3 — Multi-User Collaboration

**Goal:** Move from a single-user tool to a collaborative platform: organizations, shared threads with edit rights, real-time co-viewing of in-progress runs, comments, and team-level admin.

**Status:** Outline only. Detailed planning happens after Phase 1 launches and we have data on whether users actually want to collaborate (vs. mostly using the tool solo).

**Prerequisite:** Phase 1 launched. Some evidence of collaborative demand (multiple users sharing threads, repeated `/share/{token}` traffic, explicit requests).

---

## 1. Why this is a separate phase

Phase 1 ships with single-user threads and opt-in read-only sharing. That's likely sufficient for educators, researchers, and solo developers. **Collaboration is a multiplier on engagement, not a baseline requirement.** Building it before validating demand risks heavy investment in features no one uses.

Phase 3 changes the data model significantly: ownership moves from `users` to `organizations`, threads gain ACLs, and the realtime layer must handle multi-subscriber state synchronization. This is a substantial change and is not justified until usage data supports it.

---

## 2. Scope

### In scope
- **Organizations:** Users can create orgs and invite teammates by email.
- **Org-owned threads:** Threads can belong to a user or to an org. Org threads have member ACLs.
- **Roles:** `org_owner`, `org_admin`, `org_member`, `org_viewer`.
- **Real-time co-viewing:** If user A is running a thread, user B in the same org can watch the run animate live (read-only).
- **Comments on runs:** Threaded comments per run, with mentions.
- **Shared API keys at org level:** Org admin uploads a key, members can use it (audit-logged).
- **Org-level usage dashboard:** Total tokens, cost, top users, top models.
- **Enhanced sharing:** Password-protected share links. Time-expiring share links. Per-run share links (currently only per-thread).
- **Granular permissions:** Public, org, specific-users.

### Out of scope (still)
- Slack/Discord/Teams integrations (Phase 4 candidate).
- Comments with rich markdown / code blocks beyond plain text in v1 of Phase 3.
- Edit conflicts on shared threads (lock-based for now; CRDT/OT is overkill).

---

## 3. Architectural changes

### Schema additions
- `organizations` (id, name, slug, created_at)
- `organization_members` (org_id, user_id, role, joined_at)
- `organization_invites` (org_id, email, role, token, expires_at)
- `threads.owner_type` + `threads.owner_id` (polymorphic: `user` or `organization`)
- `thread_acls` (thread_id, user_id, role) — for fine-grained per-user access on org threads
- `comments` (id, run_id, user_id, parent_comment_id, body, created_at)
- `audit_log` (id, actor_user_id, action, target_type, target_id, metadata, created_at)

### Realtime channels
- Per-org channel `private-org.{id}` for activity feeds.
- Per-thread channel `private-thread.{id}` for co-viewing — broadcast token stream to all subscribers, not just the submitter.

### Permission model
- New `Gate` policies for every thread/run/comment action.
- Middleware to resolve "current org context" (e.g., a route helper `Auth::currentOrg()`).
- UI org switcher in the top bar.

---

## 4. Milestones (sketch, ~8 weeks)

| # | Milestone | Notes |
|---|---|---|
| P3-M1 | Organizations data layer | Schema, models, basic CRUD. Invite flow via email. |
| P3-M2 | Polymorphic ownership | Migrate `threads` to support org ownership. Backfill existing threads to user ownership. |
| P3-M3 | Permission system | Gates + policies + middleware. Comprehensive test coverage on auth boundaries. |
| P3-M4 | Co-viewing | Broadcast to thread channel, not just submitter. Frontend "live indicator" when others are watching. |
| P3-M5 | Comments | Per-run threaded comments with mentions. Email notifications. |
| P3-M6 | Org-level API keys | Encrypted, member-usable, audit-logged. |
| P3-M7 | Org dashboard | Usage analytics. |
| P3-M8 | Enhanced sharing | Password-protect + expiry + per-run links. |

---

## 5. Open questions for Phase 3

- **Pricing model:** Does Phase 3 introduce paid org tiers? If so, billing infrastructure (Stripe) becomes Phase 3 scope — itself a multi-week effort.
- **Existing data migration:** All Phase 1 threads are user-owned. Migration path to org ownership: opt-in, automatic, or never?
- **Email infrastructure:** Phase 1 doesn't send email. Phase 3 needs invites + notifications. Postmark, Resend, or SES?
- **Audit log retention:** Forever, or rolling window? Storage cost vs. compliance value.
- **Permissions UI:** Per-thread permission editor is complex UX. Lean on org-level defaults, or expose full granularity?
- **Mobile:** Co-viewing implies push notifications and a usable mobile view. Phase 3 or strict desktop-only still?

---

## 6. Success criteria

- A team of 3 can create an org, share a thread, watch each other run prompts live, and discuss in comments.
- Org-level API keys reduce per-user key management overhead with no security regression.
- Audit log captures every key use, thread share, and permission change.
- Existing single-user workflows from Phase 1 are unchanged unless the user actively joins or creates an org.
