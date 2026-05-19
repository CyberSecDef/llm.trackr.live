<?php

namespace App\Http\Controllers;

use App\Models\LlmModel;
use App\Models\Thread;
use App\Services\Llm\TokenCounter\TokenCounterFactory;
use App\Services\Threads\ContextBudgetCalculator;
use App\Services\Threads\ConversationHistoryBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /threads/{thread}/preview (M7 chunk 6a).
 *
 * Returns everything the prompt-input panel needs to render its
 * preview / token-count / context-window-warning UI without
 * submitting a run:
 *
 *   - `history`: messages array that will be sent to the vendor,
 *     in the OpenAI-compatible role/content shape.
 *   - `token_counts`: { history, prompt, reserved, total } —
 *     reserved counts max_tokens; total is what the budget check
 *     applies to.
 *   - `budget`: model's context_length (0 means unlimited / unknown).
 *   - `fits` / `over_by`: result of the same ContextBudgetCalculator
 *     that RunService::submit uses, so client + server stay aligned.
 *
 * The frontend calls this on a 400ms debounce as the user types.
 * Each call is small (one tokenizer pass over the prompt + the
 * cached history string) so the round-trip cost is bounded.
 *
 * Ownership: same-user gate matches the submit endpoint.
 */
class PromptPreviewController extends Controller
{
    public function __construct(
        private readonly ConversationHistoryBuilder $historyBuilder,
        private readonly ContextBudgetCalculator $budgetCalculator,
        private readonly TokenCounterFactory $tokenCounters,
    ) {}

    public function show(Request $request, Thread $thread): JsonResponse
    {
        abort_unless($thread->user_id === $request->user()->id, 403);

        $validated = $request->validate([
            'prompt' => ['required', 'string'],
            'model_id' => ['required', 'integer', 'exists:models,id'],
            'parameters' => ['sometimes', 'array'],
            'parameters.max_tokens' => ['sometimes', 'integer', 'min:0'],
        ]);

        $model = LlmModel::findOrFail($validated['model_id']);
        $history = $this->historyBuilder->build($thread);
        $prompt = $validated['prompt'];
        $reserved = (int) ($validated['parameters']['max_tokens'] ?? 0);

        $counter = $this->tokenCounters->counterFor($model->vendor, $model->name);

        $historyTokens = 0;
        foreach ($history as $turn) {
            $historyTokens += $counter->count((string) ($turn['content'] ?? ''));
        }
        $promptTokens = $counter->count($prompt);

        $budgetResult = $this->budgetCalculator->check($model, $history, $prompt, $reserved);

        return response()->json([
            'history' => $history,
            'token_counts' => [
                'history' => $historyTokens,
                'prompt' => $promptTokens,
                'reserved' => $reserved,
                'total' => $historyTokens + $promptTokens + $reserved,
            ],
            'budget' => $model->context_length ?? 0,
            'fits' => $budgetResult->fits,
            'over_by' => $budgetResult->overBy,
            'model' => [
                'id' => $model->id,
                'vendor' => $model->vendor,
                'name' => $model->name,
                'context_length' => $model->context_length,
            ],
        ]);
    }
}
