<?php

namespace App\Services\Threads;

use App\Enums\RunStatus;
use App\Models\ApiKey;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use App\Services\Threads\Exceptions\ContextOverflowException;
use App\Services\Threads\Exceptions\EmptyPromptException;
use App\Services\Threads\Exceptions\InvalidParamsException;
use App\Services\Threads\Exceptions\NoApiKeyException;
use App\Services\Threads\Exceptions\ThreadOwnershipException;
use Illuminate\Support\Facades\DB;

/**
 * Submit a new run into a thread.
 *
 * The chunky one — composes ConversationHistoryBuilder +
 * ContextBudgetCalculator + ThreadService's invariants + the
 * vendor-client layer's needs (we DON'T call the vendor here; we
 * just persist a pending Run that M6's streaming pipeline picks up).
 *
 * Authorization: this service DOES verify the user owns the thread,
 * unlike ThreadService which deliberately leaves authz to the
 * controller. The reason: the controller would have to duplicate
 * 3 distinct checks (thread ownership, api-key presence, context
 * budget) just to call this method correctly. Centralizing them
 * here means a typo at one call site can't bypass any of them.
 */
class RunService
{
    public function __construct(
        private readonly ConversationHistoryBuilder $historyBuilder,
        private readonly ContextBudgetCalculator $budgetCalculator,
        private readonly ThreadService $threadService,
    ) {}

    /**
     * @param  array<string, mixed>  $params  Inference parameters per SPEC §3.1.4 — temperature, top_p, top_k, max_tokens, seed, etc.
     *
     * @throws ThreadOwnershipException Acting user doesn't own the thread.
     * @throws EmptyPromptException
     * @throws NoApiKeyException
     * @throws InvalidParamsException
     * @throws ContextOverflowException
     */
    public function submit(
        User $user,
        Thread $thread,
        LlmModel $model,
        string $prompt,
        array $params = [],
    ): Run {
        $this->guardOwnership($user, $thread);
        $prompt = $this->guardPrompt($prompt);
        $this->guardParams($params);
        $apiKey = $this->resolveApiKey($user, $model);
        $history = $this->historyBuilder->build($thread);
        $this->guardBudget($model, $history, $prompt, $params);

        return DB::transaction(function () use (
            $user, $thread, $model, $prompt, $params, $history,
        ) {
            // Auto-title on the FIRST run only — never overwrites an
            // existing title (user-set or auto-set on a prior turn).
            if ($thread->title === null) {
                $thread->title = $this->autoTitle($prompt);
            }
            $thread->last_activity_at = now();
            $thread->save();

            $sequence = ($thread->runs()->max('sequence_in_thread') ?? 0) + 1;
            $storePrompt = (bool) $user->store_prompts;

            return Run::create([
                'thread_id' => $thread->id,
                'user_id' => $user->id,
                'model_id' => $model->id,
                'sequence_in_thread' => $sequence,
                // Privacy redaction (SPEC §10.4): drop prompt + history
                // when the user opted out; prompt_hash stays so replay
                // determinism survives.
                'prompt' => $storePrompt ? $prompt : null,
                'prompt_hash' => hash('sha256', $prompt),
                'conversation_history' => $storePrompt ? $history : null,
                'parameters' => array_merge($params, [
                    'model_snapshot' => $this->snapshotModel($model),
                ]),
                'status' => RunStatus::Pending,
            ])
                ->setRelation('thread', $thread)
                ->setRelation('user', $user)
                ->setRelation('model', $model);
        });

        // Suppress unused-variable warning on $apiKey — kept so a future
        // refactor that needs the key (e.g. to validate it's reachable
        // before persisting the pending run) doesn't need to re-add
        // the lookup. Currently the streaming pipeline (M6) re-resolves
        // when it actually fires.
    }

    private function guardOwnership(User $user, Thread $thread): void
    {
        if ($thread->user_id !== $user->id) {
            throw ThreadOwnershipException::userNotOwner();
        }
    }

    private function guardPrompt(string $prompt): string
    {
        $trimmed = trim($prompt);
        if ($trimmed === '') {
            throw new EmptyPromptException;
        }

        return $trimmed;
    }

    /**
     * Validate inference params against SPEC §3.1.4 bounds. Unknown
     * keys pass through — let the vendor reject what it doesn't
     * understand rather than maintain a per-vendor allow-list here.
     *
     * @param  array<string, mixed>  $params
     */
    private function guardParams(array $params): void
    {
        if (isset($params['temperature'])) {
            $t = (float) $params['temperature'];
            if ($t < 0.0 || $t > 2.0) {
                throw new InvalidParamsException('temperature', 'must be between 0.0 and 2.0');
            }
        }
        if (isset($params['top_p'])) {
            $p = (float) $params['top_p'];
            if ($p < 0.0 || $p > 1.0) {
                throw new InvalidParamsException('top_p', 'must be between 0.0 and 1.0');
            }
        }
        if (isset($params['top_k'])) {
            $k = (int) $params['top_k'];
            if ($k < 0 || $k > 500) {
                throw new InvalidParamsException('top_k', 'must be between 0 and 500');
            }
        }
        if (isset($params['max_tokens'])) {
            $m = (int) $params['max_tokens'];
            if ($m < 1) {
                throw new InvalidParamsException('max_tokens', 'must be at least 1');
            }
        }
    }

    /**
     * Pick the user's API key for the model's vendor. Throws if none
     * is on file. For Meta-via-Together: fall back to a 'together' key
     * when no 'meta' key exists (UX gap noted in M4 chunk 5).
     */
    private function resolveApiKey(User $user, LlmModel $model): ApiKey
    {
        $key = $user->apiKeys()->where('vendor', $model->vendor)->first();

        if ($key === null && $model->vendor === 'meta') {
            // Meta models route through Together; fall back to that key.
            $key = $user->apiKeys()->where('vendor', 'together')->first();
        }

        if ($key === null) {
            throw new NoApiKeyException($model->vendor);
        }

        return $key;
    }

    /**
     * @param  list<array{role: string, content: string}>  $history
     * @param  array<string, mixed>  $params
     */
    private function guardBudget(LlmModel $model, array $history, string $prompt, array $params): void
    {
        $reservedForResponse = (int) ($params['max_tokens'] ?? 0);
        $result = $this->budgetCalculator->check($model, $history, $prompt, $reservedForResponse);

        if (! $result->fits) {
            throw new ContextOverflowException($result);
        }
    }

    /**
     * First 60 chars of the trimmed prompt, truncated at a word
     * boundary if possible, with `…` appended.
     */
    private function autoTitle(string $prompt): string
    {
        $trimmed = trim($prompt);
        if (mb_strlen($trimmed) <= 60) {
            return $trimmed;
        }

        $truncated = mb_substr($trimmed, 0, 60);
        $lastSpace = mb_strrpos($truncated, ' ');
        // Only trim back to a word boundary if it leaves us with enough
        // characters that the title still says something meaningful.
        if ($lastSpace !== false && $lastSpace > 30) {
            $truncated = mb_substr($truncated, 0, $lastSpace);
        }

        return rtrim($truncated) . '…';
    }

    /**
     * Snapshot the model's architecture + capacity fields into
     * parameters.model_snapshot so replay (M9) is deterministic even
     * if the model row gets edited or refreshed later (SPEC §10.1).
     *
     * @return array<string, mixed>
     */
    private function snapshotModel(LlmModel $model): array
    {
        return [
            'id' => $model->id,
            'vendor' => $model->vendor,
            'name' => $model->name,
            'display_name' => $model->display_name,
            'architecture_type' => $model->architecture_type?->value,
            'layers' => $model->layers,
            'hidden_dim' => $model->hidden_dim,
            'attention_heads' => $model->attention_heads,
            'moe_experts' => $model->moe_experts,
            'moe_active_experts' => $model->moe_active_experts,
            'position_encoding' => $model->position_encoding?->value,
            'context_length' => $model->context_length,
            'pricing_input_per_million' => $model->pricing_input_per_million,
            'pricing_output_per_million' => $model->pricing_output_per_million,
            'metadata_estimated' => $model->metadata_estimated,
        ];
    }
}
