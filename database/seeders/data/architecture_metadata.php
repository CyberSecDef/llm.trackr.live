<?php

/**
 * Architecture metadata fixture for the model registry.
 *
 * OpenRouter doesn't expose layer count, hidden dim, MoE structure, or
 * position encoding. We maintain those facts here, keyed by `models.name`
 * (the post-slash portion of the OpenRouter id — e.g. "openai/gpt-4o"
 * matches the "gpt-4o" key below). The ModelRegistryRefreshService joins
 * OpenRouter rows with this file at refresh time.
 *
 * `metadata_estimated => true` flags rows where the vendor doesn't
 * publish architecture details and we're working from rumor / public
 * inference. These show a visual indicator in the admin UI (M3 chunk 4).
 *
 * Values use plain strings instead of App\Enums\* instances so the file
 * stays import-free. The service casts to enums on upsert.
 *
 * Phase 1 launch set per SPEC §7. Add new rows as new models land.
 */

return [
    // ─── OpenAI ────────────────────────────────────────────────────────
    'gpt-4o' => [
        'display_name' => 'GPT-4o',
        'architecture_type' => 'dense',
        // OpenAI doesn't publish layer counts for closed models. Best-guess
        // based on public discussion + parameter-count inference.
        'layers' => null,
        'hidden_dim' => null,
        'attention_heads' => null,
        'position_encoding' => 'rope',
        'supports_logprobs' => true,
        'supports_seed' => true,
        'metadata_estimated' => true,
    ],
    'gpt-4o-mini' => [
        'display_name' => 'GPT-4o mini',
        'architecture_type' => 'dense',
        'layers' => null,
        'hidden_dim' => null,
        'attention_heads' => null,
        'position_encoding' => 'rope',
        'supports_logprobs' => true,
        'supports_seed' => true,
        'metadata_estimated' => true,
    ],

    // ─── Anthropic ─────────────────────────────────────────────────────
    'claude-3-5-sonnet' => [
        'display_name' => 'Claude 3.5 Sonnet',
        'architecture_type' => 'dense',
        'layers' => null,
        'hidden_dim' => null,
        'attention_heads' => null,
        'position_encoding' => 'rope',
        'supports_logprobs' => false,
        'supports_seed' => false,
        'metadata_estimated' => true,
    ],
    'claude-3-5-haiku' => [
        'display_name' => 'Claude 3.5 Haiku',
        'architecture_type' => 'dense',
        'layers' => null,
        'hidden_dim' => null,
        'attention_heads' => null,
        'position_encoding' => 'rope',
        'supports_logprobs' => false,
        'supports_seed' => false,
        'metadata_estimated' => true,
    ],

    // ─── Google ────────────────────────────────────────────────────────
    'gemini-1.5-pro' => [
        'display_name' => 'Gemini 1.5 Pro',
        // Architecture not officially published; MoE strongly rumored
        // (see e.g. Demis Hassabis press comments). Flagged estimated.
        'architecture_type' => 'moe',
        'layers' => null,
        'hidden_dim' => null,
        'attention_heads' => null,
        'moe_experts' => null,
        'moe_active_experts' => null,
        'position_encoding' => 'rope',
        'supports_logprobs' => false,
        'supports_seed' => false,
        'metadata_estimated' => true,
    ],

    // ─── xAI ───────────────────────────────────────────────────────────
    'grok-2' => [
        'display_name' => 'Grok 2',
        'architecture_type' => 'moe',
        'layers' => null,
        'hidden_dim' => null,
        'attention_heads' => null,
        'moe_experts' => null,
        'moe_active_experts' => null,
        'position_encoding' => 'rope',
        'supports_logprobs' => false,
        'supports_seed' => false,
        'metadata_estimated' => true,
    ],

    // ─── Meta (Llama, served via Groq/Together) ────────────────────────
    'llama-3.1-70b' => [
        'display_name' => 'Llama 3.1 70B',
        'architecture_type' => 'dense',
        'layers' => 80,
        'hidden_dim' => 8192,
        'attention_heads' => 64,
        'position_encoding' => 'rope',
        'supports_logprobs' => true,
        'supports_seed' => true,
        'metadata_estimated' => false,
    ],
    'llama-3.1-405b' => [
        'display_name' => 'Llama 3.1 405B',
        'architecture_type' => 'dense',
        'layers' => 126,
        'hidden_dim' => 16384,
        'attention_heads' => 128,
        'position_encoding' => 'rope',
        'supports_logprobs' => true,
        'supports_seed' => true,
        'metadata_estimated' => false,
    ],

    // ─── Mistral ───────────────────────────────────────────────────────
    'mixtral-8x22b' => [
        'display_name' => 'Mixtral 8x22B',
        'architecture_type' => 'moe',
        'layers' => 56,
        'hidden_dim' => 6144,
        'attention_heads' => 48,
        'moe_experts' => 8,
        'moe_active_experts' => 2,
        'position_encoding' => 'rope',
        'supports_logprobs' => true,
        'supports_seed' => true,
        'metadata_estimated' => false,
    ],
    'mistral-large' => [
        'display_name' => 'Mistral Large',
        'architecture_type' => 'dense',
        'layers' => null,
        'hidden_dim' => null,
        'attention_heads' => null,
        'position_encoding' => 'rope',
        'supports_logprobs' => false,
        'supports_seed' => true,
        'metadata_estimated' => true,
    ],
];
