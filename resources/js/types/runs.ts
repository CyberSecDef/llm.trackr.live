/*
 * Wire-shape types for the 6 broadcast events from the streaming
 * pipeline (M6). Each matches the corresponding PHP event's
 * broadcastWith() output exactly — if you change one, change the other.
 *
 * Discriminated union via the `event` field so consumers can switch on
 * the type and let TypeScript narrow the payload.
 */

export interface RunStartedPayload {
    run_id: number;
    thread_id: number;
    model_id: number;
    started_at: string;
}

export interface TokenLogprob {
    token: string;
    logprob: number;
}

export interface TokenReceivedPayload {
    run_id: number;
    token: string;
    index: number;
    t_ms: number;
    logprobs: TokenLogprob[] | null;
    is_final: boolean;
}

export interface LayerAdvancedPayload {
    run_id: number;
    token_index: number;
    total_layers: number | null;
}

export interface MoeRoutedPayload {
    run_id: number;
    token_index: number;
    experts: number[];
    scores: number[];
}

export interface RunCompletedPayload {
    run_id: number;
    input_tokens: number;
    output_tokens: number;
    duration_ms: number;
    tokens_per_second: number;
    estimated_cost: number | null;
}

export interface RunErroredPayload {
    run_id: number;
    message: string;
    partial_output: string | null;
}

export type RunEvent =
    | { event: 'run.started'; payload: RunStartedPayload }
    | { event: 'token.received'; payload: TokenReceivedPayload }
    | { event: 'layer.advanced'; payload: LayerAdvancedPayload }
    | { event: 'moe.routed'; payload: MoeRoutedPayload }
    | { event: 'run.completed'; payload: RunCompletedPayload }
    | { event: 'run.errored'; payload: RunErroredPayload };

export const RUN_EVENT_NAMES = [
    'run.started',
    'token.received',
    'layer.advanced',
    'moe.routed',
    'run.completed',
    'run.errored',
] as const;
