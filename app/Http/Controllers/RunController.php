<?php

namespace App\Http\Controllers;

use App\Http\Requests\SubmitRunRequest;
use App\Jobs\StreamRunJob;
use App\Models\LlmModel;
use App\Models\Thread;
use App\Services\Threads\Exceptions\ContextOverflowException;
use App\Services\Threads\Exceptions\EmptyPromptException;
use App\Services\Threads\Exceptions\InvalidParamsException;
use App\Services\Threads\Exceptions\NoApiKeyException;
use App\Services\Threads\Exceptions\ThreadOwnershipException;
use App\Services\Threads\RunService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * POST /threads/{thread}/runs (M6 chunk 4a).
 *
 * Thin controller: defers field-level validation to SubmitRunRequest,
 * delegates orchestration to RunService::submit, and translates each
 * domain exception into the right HTTP error shape.
 *
 * On success: persists the Pending run, dispatches StreamRunJob (the
 * worker that handles the vendor stream), and returns the new run's
 * id + the channel the frontend should subscribe to. The frontend
 * doesn't see any tokens through the HTTP response — those arrive via
 * the `private-runs.{id}` WebSocket channel.
 */
class RunController extends Controller
{
    public function __construct(private readonly RunService $runService) {}

    public function store(SubmitRunRequest $request, Thread $thread): JsonResponse|RedirectResponse
    {
        $validated = $request->validated();
        $model = LlmModel::findOrFail($validated['model_id']);

        try {
            $run = $this->runService->submit(
                user: $request->user(),
                thread: $thread,
                model: $model,
                prompt: $validated['prompt'],
                params: $validated['parameters'] ?? [],
            );
        } catch (ThreadOwnershipException $e) {
            abort(403, $e->getMessage());
        } catch (EmptyPromptException $e) {
            // Already caught by FormRequest's `required` rule, but kept
            // for defense in depth — a future caller that bypasses the
            // FormRequest still hits the same 422 shape.
            throw ValidationException::withMessages(['prompt' => $e->getMessage()]);
        } catch (NoApiKeyException $e) {
            // Carry the vendor in the response so the UI can deep-link
            // to the API Keys page pre-filtered to the right vendor.
            throw ValidationException::withMessages([
                'model_id' => [$e->getMessage()],
            ])->status(422);
        } catch (InvalidParamsException $e) {
            throw ValidationException::withMessages([
                "parameters.{$e->field}" => [$e->getMessage()],
            ]);
        } catch (ContextOverflowException $e) {
            // The exception carries a ContextBudgetResult; the message
            // already includes 'N over Y' so we don't need to repeat.
            throw ValidationException::withMessages([
                'prompt' => [$e->getMessage()],
            ]);
        }

        StreamRunJob::dispatch($run);

        // Dual response: Inertia (`X-Inertia` header set by useForm.post)
        // needs a redirect to trigger the page-reload that picks up the
        // new run in the `runs` prop. Plain JSON / API callers (the
        // existing chunk-4a test surface, future internal-API consumers)
        // still get the 201 + run shape they expect.
        if ($this->wantsInertiaRedirect($request)) {
            return redirect()->route('threads.show', ['thread' => $thread->id]);
        }

        return response()->json([
            'run' => [
                'id' => $run->id,
                'thread_id' => $run->thread_id,
                'model_id' => $run->model_id,
                'sequence_in_thread' => $run->sequence_in_thread,
                'status' => $run->status->value,
                'created_at' => $run->created_at?->toIso8601String(),
            ],
            'channel' => "private-runs.{$run->id}",
        ], 201);
    }

    /**
     * Inertia's useForm.post sets `X-Inertia: true`. Anything without
     * that header (curl / postJson / future API token holder) gets
     * the JSON branch.
     */
    private function wantsInertiaRedirect(Request $request): bool
    {
        return $request->header('X-Inertia') === 'true';
    }
}
