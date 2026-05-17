# Phase 2 — Tensor-Accurate Visualization (Python Sidecar)

**Goal:** Add a separately-deployed Python service that runs **open-weights** models with tensor-level hooks, exposing real attention weights, MoE router scores, and hidden states to the visualization. Proprietary models (OpenAI, Anthropic, Google, xAI) remain illustrative — the sidecar can't access them.

**Status:** Outline only. Detailed planning happens after Phase 1 launches and we have usage signal on whether tensor accuracy is actually demanded.

**Prerequisite:** Phase 1 launched and stable.

---

## 1. Why this is a separate phase

The Phase 0 hosting decision (DreamHost VPS, no Python) eliminated local model execution from the launch product. Phase 2 reverses that decision **for a separately-deployed sidecar only**. The main Laravel app stays on DreamHost; the sidecar lives wherever GPUs are affordable (Modal, RunPod, Replicate, Hetzner GPU instances).

Splitting it this way means:
- Phase 1 ships without GPU dependencies and can be evaluated standalone.
- The sidecar can be turned off if it's too expensive or low-value, without breaking the rest of the app.
- The architecture choice (PHP main + Python sidecar via HTTP) doesn't compromise the launch product.

---

## 2. Scope

### In scope
- Python service that loads open-weights models (Llama, Mixtral, Mistral, Gemma, Qwen, etc.) via `transformers` + PyTorch.
- HTTP API for streamed generation with optional `include_attention=true`, `include_router_scores=true`, `include_hidden_states=true` flags.
- Per-layer attention weight delivery as compressed tensors (lz4 + base64) over WebSocket.
- Real MoE router scores for Mixtral and similar MoE models.
- Frontend updates to consume real-vs-illustrative data and indicate which is which.
- Cost-aware routing: main app checks if a model has a sidecar implementation; if yes, prefers sidecar; if no, falls back to vendor API.

### Out of scope (still)
- Closed-source models (no way to hook these — OpenAI/Anthropic/Google APIs don't expose attention).
- Training, fine-tuning, or LoRA.
- Models that don't fit on commodity single-GPU instances (i.e., no 405B-class models unless multi-GPU instances are budgeted).

---

## 3. Architecture sketch

```
┌──────────────────────┐         HTTPS         ┌─────────────────────────────┐
│  Laravel (DreamHost) │ ────────────────────▶ │  Python sidecar (GPU host)  │
│                      │  POST /generate       │                             │
│  - User auth         │  (streaming response) │  FastAPI + transformers     │
│  - Thread state      │ ◀──────────────────── │  PyTorch + flash-attention  │
│  - Model selection   │  WebSocket            │                             │
│                      │  (token + tensors)    │  Hooks on:                  │
│                      │                       │   - attention layers        │
│                      │                       │   - MoE router              │
│                      │                       │   - hidden states           │
└──────────────────────┘                       └─────────────────────────────┘
            │                                              │
            └─▶ existing Soketi ─▶ frontend ◀──────────────┘
                (multiplexes events from both backends)
```

The frontend doesn't talk to the sidecar directly — Laravel proxies, so auth and rate limiting still apply.

---

## 4. Milestones (sketch, ~6 weeks)

| # | Milestone | Notes |
|---|---|---|
| P2-M1 | Sidecar scaffold | FastAPI app, `/health`, model loading from HF Hub, a single `/generate` non-streaming endpoint. |
| P2-M2 | Streaming + hooks | SSE/WebSocket streaming. Per-token attention and router-score capture. Compression. |
| P2-M3 | Main app integration | New `SidecarClient` implementing `LlmClientInterface`. Model registry gains `sidecar_compatible` flag. |
| P2-M4 | Frontend consumption | Real heatmap rendering. "Real vs illustrative" badge on viz panels. |
| P2-M5 | Deployment | Modal or RunPod recipe. Auto-scale to zero when idle. |
| P2-M6 | Cost controls | Per-user sidecar quota (separate from vendor-API rate limit). Cold-start UX. |

---

## 5. Open questions for Phase 2

- **GPU host vendor:** Modal (serverless, pay-per-second, fast cold starts) vs RunPod (cheaper steady-state, slower starts) vs Replicate (simplest but most expensive)?
- **Model selection:** Which open-weights models to support at Phase 2 launch? Start with Mixtral (MoE highlight) + Llama-3.1-8B (dense baseline)?
- **Attention compression:** Full per-layer per-token attention tensors are huge. Quantize to int8? Down-sample? Send only top-k attention sources per query position?
- **Funding model:** If sidecar GPU time costs $X/hour, does the BYOK model break? Do we need a paid tier or a "user supplies their own Modal API key"?
- **Latency:** Sidecar adds at least one hop. Acceptable budget vs. vendor APIs (which are also network-bound)?
- **Failure mode:** When sidecar is offline (cold-start timeout, GPU unavailable), fall back to illustrative animation or error out?

---

## 6. Success criteria

- A Mixtral run via the sidecar shows real MoE router scores in the visualization.
- A Llama-3.1-8B run shows real per-layer attention heatmaps.
- The "real vs illustrative" indicator correctly reflects data source.
- A user who has no sidecar quota gracefully falls back to vendor-API illustrative mode.
- Sidecar cost per typical run < $0.05 (after auto-scale-to-zero).
