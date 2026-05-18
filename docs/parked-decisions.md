# Parked Decisions

Architectural or technical choices that are **explicitly deferred** to a later milestone where the decision has the right context. Each entry says what's parked, why, and when we revisit.

Anything resolved here gets moved into `SPEC.md` and removed from this list.

---

## 1. WebSocket server: Soketi vs. Laravel Reverb

**Status:** Parked. Revisit at **Phase 1 / M6 (Realtime + Streaming Pipeline)**.

**Current spec choice:** Soketi (Pusher-protocol-compatible, self-hosted Node service).

**Why it's parked:** Discovered during Laravel 13 verification that **Laravel Reverb** is now the first-party WebSocket server — designed for Laravel, same install/maintenance surface as the rest of the framework, no Pusher-protocol compat shim needed. The original SPEC chose Soketi before Reverb was on our radar.

**What we'd weigh at M6:**
- **Reverb upside:** first-party, official docs path, single-stack install via composer/artisan, native Laravel broadcasting integration, no `pusher-js` client (Echo + Reverb's client work directly).
- **Reverb downside:** newer (less third-party tooling), tied to Laravel release cadence, less battle-tested at scale than Soketi/Pusher.
- **Soketi upside:** Pusher-protocol-compatible (any Pusher SDK works), proven at scale, mature.
- **Soketi downside:** independent project, extra moving part to maintain, requires `pusher-js` + Pusher driver on Laravel side.

**Decision criteria:**
- Does Reverb support our broadcast pattern (per-run private channels with Sanctum auth)? (Almost certainly yes; verify.)
- Is the SSE fallback equally clean against either backend? (Yes — fallback bypasses both.)
- Does Reverb's clustering story handle our 100-concurrent-user target on a single VPS? (Likely yes; Soketi is also fine for that scale.)

**Action at M6:** spike both for 1 day each, pick the simpler one, update SPEC §5 / §10.2 / §10.6.

---

## 2. Vendor clients: hand-rolled vs. Laravel AI SDK / Prism

**Status:** ✅ Resolved 2026-05-17 at M4 chunk 2 — **hand-rolled `LlmClientInterface`**.

**Decision summary:**
- **Laravel AI SDK** (`laravel/ai`, first-party) covers all 9 of our vendors and streaming, but does not expose logprobs / token-level data and has no documented path for custom vendors. SPEC §3.1.5's logits-distribution panel needs OpenAI logprobs, so the SDK abstraction would block a real product requirement.
- **Prism** (`prism-php/prism`) is still pre-1.0 (v0.100 as of March 2026) with API instability risk and less clear vendor coverage. Wouldn't pick over the first-party SDK unless it had features the SDK lacks.
- **Hand-rolled** wins because: (a) we need raw access to logprobs + token-level streams for the visualization, (b) the 9 vendors cluster into only 4 protocols (OpenAI-compatible × 5, Anthropic event-stream, Google streamGenerateContent, HuggingFace TGI), plus a Meta-via-Together wrapper, (c) HTTP-level testing with recorded fixtures is more reliable than wrapping an SDK's evolving surface.

**Original (now-historical) deliberation kept for context:**

**Current spec plan:** Hand-rolled `LlmClientInterface` with 9 vendor implementations (`OpenAiClient`, `AnthropicClient`, etc.).

**Why it's parked:** The Laravel 13 docs surface a **"Laravel AI SDK"** as a first-party package (also "Laravel MCP", "Laravel Boost"). Unknown coverage — possibly handles streaming, multi-vendor abstraction, tool use. Could either eliminate most of M4 or be limited in ways that don't fit our 9-vendor matrix.

**What we'd check at M4:**
- Which vendors does the Laravel AI SDK actually support? (Need at minimum: OpenAI, Anthropic, Google, xAI, Mistral, Groq, Together, HuggingFace, Meta-via-proxy.)
- Streaming support — does it yield token-by-token chunks, expose logprobs/usage metadata, support seed/temperature/top-p/top-k uniformly?
- Token counting — vendor-accurate or approximate?
- Customization — can we add a vendor it doesn't yet support?
- Bundle size / dependency footprint.

**Also worth checking:** the community package **Prism** (`prism-php/prism`) which is the de-facto multi-vendor LLM client for Laravel and predates the official SDK. May cover more vendors, may have better streaming ergonomics.

**Decision criteria:**
- If Laravel AI SDK or Prism covers ≥ 7 of our 9 vendors with streaming, use it as the base and write thin wrappers for the rest.
- If coverage is < 5, stick with the hand-rolled `LlmClientInterface` approach for full control.
- Between Laravel AI SDK and Prism: prefer the first-party one if feature parity, otherwise the more featureful one.

**Action at M4:** spend up to half a day evaluating each, then commit to a path before any vendor implementation work.

---

## 3. (Add new parked items above this line as they emerge.)
