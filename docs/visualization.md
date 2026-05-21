
I'll also suggest a consistent visual language up front so the scenes feel like one piece:
- **Tokens** = rounded rectangles, colored by token ID hash
- **Vectors** = horizontal bars or 1D heatmap strips (each cell a color from a magma/viridis ramp based on value)
- **Matrices** = 2D heatmap grids
- **Weights/parameters** = dimmed gray, "always there in the background"
- **Active computation** = bright, animated, with traveling particles or pulses along data paths
- **Camera** = mostly fixed per scene, but a few scenes benefit from a zoom-out reveal

---

### Scene 0 — Prompt entry (0.5s)

A chat textbox in the center of the canvas. The user's prompt types itself in (or pastes in). At end of scene the textbox glows once and the characters detach from it, floating slightly above the box. The textbox fades back, leaving floating glyphs.

**Output state:** floating characters in a row.

### Scene 1 — Characters → UTF-8 bytes (1.5s)

Each character bounces up about 40px in a staggered wave (left to right, ~30ms offset per char). At peak it flips 180° on the X-axis and lands as its byte value. "h" → 104, "e" → 101, etc. Multi-byte UTF-8 chars (emoji, non-Latin) split into 2-4 numbers — emphasize this with a tiny "split" animation so the user learns that bytes ≠ characters. End state: a comma-separated row of small integer pills.

**Output state:** array of byte integers.

### Scene 2 — Chat template wrap (2s)

Camera pulls back slightly. Two new "blocks" of bytes slide in from offscreen — a system-prompt block from above (tinted purple), and special role markers `<|user|>` / `<|assistant|>` (tinted teal). They snap into position bracketing the user's bytes. Show the special-token strings briefly as text labels, then collapse them into their byte representations so the whole row is uniform integers again. The row is now ~3-5x longer than the user input.

**Output state:** one long byte array with visible color tinting marking section boundaries.

### Scene 3 — Tokenization / BPE (3-5s)

This is a great teaching scene. Show the byte row and a sidebar labeled **Vocabulary** with a scrolling list of token strings + IDs.

Animate BPE greedily, left to right: brackets `[ ]` slide in around 1-4 adjacent bytes, "lock in" with a snap, and the bracketed group fuses into a single rounded token pill labeled with its string ("token", "ization", " the", etc.). Simultaneously, a line shoots from the new pill to the matching row in the vocabulary sidebar, which scrolls and highlights to reveal the token ID. The pill then displays the ID number underneath the string.

Pace it so common words get tokenized fast (200ms each) but a rare/split word slows down to ~600ms so the viewer sees the sub-word split happen. End with all pills showing both string + ID; then strings fade and only IDs remain.

**Output state:** compact row of token IDs (e.g., 30-50 integers instead of 200+ bytes).

### Scene 4 — Token ID array (0.5s breather)

Just clean integers in a row. A label appears: "context length: N tokens." This gives the viewer a moment to register the compression that just happened.

**Output state:** token ID array.

### Scene 5 — Embedding lookup (3s)

Camera dramatically zooms out. The token row shrinks to the bottom of the screen. Above it, a **massive** matrix materializes — show it as a wireframe grid labeled "Embedding table: 128,000 × 4096." Make it visually overwhelming; this is the first "wow this is big" moment.

For each token ID, a vertical beam shoots up from the token into a specific row of the matrix. That row lights up, detaches, and slides down to replace the token pill — now appearing as a horizontal 4096-cell heatmap strip (you'll render maybe 128 cells visibly with the rest implied via "..."). Each strip has a different pattern of colors because each token has a unique learned embedding.

**Output state:** sequence of colored vector strips, one per token, stacked or in a row.

### Scene 6 — Positional encoding / RoPE (2s)

A small position counter (0, 1, 2, 3...) appears above each vector strip. Then a rotation animation: each strip visibly "twists" — you can render this as a subtle wave/shear across the cells, or as the strip rotating in 3D around its long axis, with the rotation amount proportional to position index. Brief "rotation angle" annotation for the first few. The colors shift slightly post-rotation.

**Output state:** position-encoded vector strips.

### Scene 7 — Layer norm (1s, then this repeats every layer)

Vector strips temporarily render as bar charts (heights = values). The bars have wildly varying heights. A horizontal "squish" animation compresses outliers and equalizes the distribution — visually it looks like the bars all snap toward a similar height range. Snap back to heatmap strip view.

**Output state:** normalized vector strips.

### Scene 8 — Multi-head self-attention (6-8s — the centerpiece)

This deserves the most production value. Three sub-beats:

**8a. QKV projection (1.5s).** From each vector strip, three new strips bud off, color-coded: **Q (blue)**, **K (red)**, **V (green)**. They arrange themselves into three parallel rows above/below the original sequence.

**8b. Attention scores (3s).** A square grid materializes — the attention matrix, N×N where N is the sequence length. For each (query token i, key token j) where j ≤ i (causal mask), draw a brief arc/laser from Q_i to K_j; the corresponding grid cell lights up with intensity proportional to the dot product. Cells above the diagonal stay black (masked). Once all cells populate, run a softmax animation row-by-row: each row's cells rebalance so they sum to 1, with the brightest cell stealing intensity from dimmer ones.

**8c. Value-weighted sum (2s).** For each output position, V vectors get pulled in with opacity matching their attention weight, blend together, and form a new output strip. Show this for the first 2-3 positions in detail, then "fast-forward" the rest.

**Multi-head detail:** during 8b, show that the attention matrix is actually a *stack* of, say, 32 transparent matrices layered with slight z-offset, each a different head. You can fan them out briefly to reveal the parallelism, then collapse back. Heads concatenate into a single output vector via a final projection (quick squeeze animation).

**Output state:** new sequence of vector strips (attention output).

### Scene 9 — Residual connection (1s)

The pre-attention vectors (which you should have kept ghosted in the background) slide forward and merge with the attention output. Render as two streams converging with a glowing `+` symbol at the junction, producing a combined output strip. Quick and crisp — this scene is structural, not flashy.

**Output state:** residual sum vectors.

### Scene 10 — Feed-forward network / FFN (3s)

Vector strips flow through a visible "pipe" that expands to ~4x width (the hidden expansion, e.g., 4096 → 16384), passes through a non-linearity (render as a brief wavy distortion or color shift representing SwiGLU), then contracts back to 4096. The expanded middle section can briefly show many more cells, emphasizing where most parameters live. Optional flavor: tiny "neuron firing" sparkles inside the expanded region.

**Output state:** FFN output vectors.

### Scene 11 — Second residual (1s)

Same as Scene 9 — pre-FFN ghost streams merge with FFN output.

**Output state:** layer output vectors.

### Scene 12 — Loop the layer stack (variable, 8-15s total for the loop)

Two ways to handle this; I'd combine them.

**Option A (recommended):** Camera pulls way back to reveal that you've been zoomed into a single floor of a tall tower. The tower has, say, 80 floors stacked vertically (or stretching into the distance with perspective). A glowing packet representing your current sequence sits on floor 1. As it moves up to floor 2, the camera follows partway then accelerates — floors 3 through 78 blur past in ~3 seconds with a "layer counter" HUD ticking up rapidly (Layer 03... 17... 42... 78...). Camera slows again for floor 79 and 80, where you re-zoom in for full detail of the final layer's attention + FFN.

**Option B (auxiliary):** A persistent mini-map in a corner showing "Layer 42 / 80" with a progress bar. Use this throughout in case the viewer loses track.

**Output state:** final-layer output vectors.

### Scene 13 — Final layer norm (0.5s)

Same squish animation as Scene 7, briefer.

### Scene 14 — LM head / unembedding (3s)

Only the **last** vector strip matters for next-token prediction — make this dramatic. All other strips dim and fade slightly to the background. The final strip floats to the center and gets projected through another massive matrix that materializes (mirror of the embedding table from Scene 5: 4096 × 128,000, labeled "LM Head"). Beams shoot through the matrix and emerge on the other side as a row of 128,000 raw logit values. Render as an extremely long, mostly-cool-colored heatmap, with a few hot spikes.

**Output state:** logits vector (length = vocab size).

### Scene 15 — Softmax → probabilities (2s)

The logits row pivots 90° and becomes a horizontal bar chart, sorted descending by value. A "softmax" wave passes across it: bars rescale so heights now represent probabilities summing to 1. Most bars collapse to near-zero; a handful of bars at the left dominate. Optional: a temperature slider in the corner you can show being adjusted — at low temp, the top bar dwarfs everything; at high temp, the distribution flattens.

**Output state:** sorted probability bar chart.

### Scene 16 — Sampling (1.5s)

A pointer/dart hovers above the top bars. Depending on sampling mode, visualize differently:
- **Greedy:** dart slams down on bar #1.
- **Top-k:** bars beyond k fade out; dart wobbles among the survivors and lands.
- **Top-p:** a horizontal "fill line" sweeps from left until cumulative probability reaches p; bars past that line fade; dart picks from the rest.

Show the chosen bar pulse brightly. The token string for the winning bar flashes above it (e.g., " the", " hello", etc.).

**Output state:** one chosen token ID + string.

### Scene 17 — Token emerges (0.5s)

The winning token flies down and appends to a "generated so far" tray that has been sitting empty at the bottom of the canvas. The string also begins to appear in a mock chat-bubble UI in the corner — this is where the streaming output accumulates for the viewer.

### Scene 18 — Autoregressive loop (variable)

Now the meta-loop. The full sequence (original + generated tokens so far) becomes the new input. Compress all of Scenes 5-17 into a fast-replay montage — about 2 seconds total for token #2, 1.5s for #3, accelerating until tokens stream out at ~5/second. Sound design opportunity here if you're using audio: a soft "tick" per generated token.

**Critical:** maintain the chat bubble in the corner growing in real-time. This is what makes the loop feel meaningful — you can *see* the response being built.

### Scene 19 — KV cache (overlay during Scene 18, 2s reveal)

The first time the loop kicks in, pause briefly and explain the cache visually. Show that the K and V matrices from all previous tokens (which lit up brightly during Scene 8) now appear in a dimmed/cached state — render them off to the side in a "cache drawer" with a small lock/disk icon. For the new token, only its own row of K and V gets computed fresh and added to the drawer. The attention matrix only gains a new bottom row each step rather than recomputing the whole grid. This is a 1-time explanatory beat; subsequent loop iterations just show the cache filling up.

### Scene 20 — Detokenization & stream out (continuous during Scene 18)

The chat bubble's growth needs its own treatment. As each token ID is chosen in Scene 17, show it briefly transforming back into its string fragment via a quick reverse-lookup to the vocabulary sidebar (which can stay docked on the left throughout the whole animation), then the string fragment flies into the chat bubble and concatenates. End-of-sequence token triggers a final flourish — the bubble glows, the entire pipeline canvas dims, and you've completed one full inference.

---

A few production notes:

**Pacing.** Total runtime for a full pass at "explanatory speed" lands around 60-90 seconds. You probably want speed controls (0.25x, 1x, 4x) and a scrubber, plus the ability to pause and inspect any scene. Consider letting the user click any vector strip to expand it and see actual numerical values.

**Persistent UI elements** that should live across all scenes: vocabulary sidebar (left), generated-text chat bubble (bottom-right), layer counter (top-right during Stage 3), and a horizontal "pipeline progress" bar at the very top showing which of the 20 steps is currently active.

**Re-runnable scenes.** Build each scene as a self-contained component that accepts its input state as props and emits its output state on completion. That lets you replay individual scenes for debugging and lets users jump to any point in the pipeline.

