<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a POST /threads/{thread}/runs payload (M6 chunk 4a).
 *
 * Field-level validation here is the FIRST line of defense; the
 * authoritative re-validation lives in `RunService::submit` so a
 * bypassed controller (e.g. a future internal-API caller) can't skip
 * the bounds checks. Duplicating the rules here gives the user a
 * clean 422 with per-field errors instead of waiting for the service
 * to throw a single-field `InvalidParamsException`.
 *
 * Authorization is intentionally NOT done here — thread ownership is
 * a service-layer invariant so RunService stays authoritative even
 * for callers that bypass the FormRequest.
 */
class SubmitRunRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, list<string>|string> */
    public function rules(): array
    {
        return [
            'model_id' => ['required', 'integer', 'exists:models,id'],
            'prompt' => ['required', 'string', 'min:1'],

            'parameters' => ['sometimes', 'array'],
            'parameters.temperature' => ['sometimes', 'numeric', 'between:0,2'],
            'parameters.top_p' => ['sometimes', 'numeric', 'between:0,1'],
            'parameters.top_k' => ['sometimes', 'integer', 'between:0,500'],
            'parameters.max_tokens' => ['sometimes', 'integer', 'min:1'],
            'parameters.seed' => ['sometimes', 'integer'],
        ];
    }
}
