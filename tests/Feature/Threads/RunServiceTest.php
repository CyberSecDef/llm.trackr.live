<?php

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
use App\Services\Threads\RunService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(RunService::class);
    $this->user = User::factory()->create(['store_prompts' => true]);
    $this->thread = Thread::factory()->for($this->user)->create();
    $this->model = LlmModel::factory()->create([
        'vendor' => 'openai',
        'name' => 'gpt-4o',
        'context_length' => 128000,
    ]);
    ApiKey::factory()->for($this->user)->vendor('openai')->create();
});

describe('happy path', function () {
    it('creates a pending Run with the right fields', function () {
        $run = $this->service->submit(
            $this->user,
            $this->thread,
            $this->model,
            'What is 2+2?',
            ['temperature' => 0.5],
        );

        expect($run->status)->toBe(RunStatus::Pending);
        expect($run->thread_id)->toBe($this->thread->id);
        expect($run->user_id)->toBe($this->user->id);
        expect($run->model_id)->toBe($this->model->id);
        expect($run->prompt)->toBe('What is 2+2?');
        expect($run->prompt_hash)->toBe(hash('sha256', 'What is 2+2?'));
        expect($run->sequence_in_thread)->toBe(1);
        expect($run->parameters['temperature'])->toBe(0.5);
    });

    it('auto-increments sequence_in_thread on subsequent submissions', function () {
        $r1 = $this->service->submit($this->user, $this->thread, $this->model, 'first');
        $r2 = $this->service->submit($this->user, $this->thread, $this->model, 'second');
        $r3 = $this->service->submit($this->user, $this->thread, $this->model, 'third');

        expect($r1->sequence_in_thread)->toBe(1);
        expect($r2->sequence_in_thread)->toBe(2);
        expect($r3->sequence_in_thread)->toBe(3);
    });

    it('stores the conversation history snapshot', function () {
        // Existing completed run in the thread.
        Run::factory()->for($this->thread)->complete()->create([
            'sequence_in_thread' => 1,
            'prompt' => 'prior q',
            'output_text' => 'prior a',
        ]);

        $run = $this->service->submit($this->user, $this->thread, $this->model, 'next q');

        expect($run->conversation_history)->toBe([
            ['role' => 'user', 'content' => 'prior q'],
            ['role' => 'assistant', 'content' => 'prior a'],
        ]);
    });

    it('snapshots the model architecture into parameters.model_snapshot', function () {
        $run = $this->service->submit($this->user, $this->thread, $this->model, 'hi');

        expect($run->parameters['model_snapshot'])->toHaveKey('id');
        expect($run->parameters['model_snapshot']['vendor'])->toBe('openai');
        expect($run->parameters['model_snapshot']['name'])->toBe('gpt-4o');
        expect($run->parameters['model_snapshot']['context_length'])->toBe(128000);
    });

    it('bumps thread.last_activity_at', function () {
        expect($this->thread->fresh()->last_activity_at)->toBeNull();

        $this->service->submit($this->user, $this->thread, $this->model, 'hi');

        expect($this->thread->fresh()->last_activity_at)->not->toBeNull();
    });
});

describe('thread auto-titling', function () {
    it('auto-titles a null-titled thread from the first prompt', function () {
        $thread = Thread::factory()->for($this->user)->create(['title' => null]);

        $this->service->submit($this->user, $thread, $this->model, 'Explain quantum entanglement to me');

        expect($thread->fresh()->title)->toBe('Explain quantum entanglement to me');
    });

    it('preserves an existing title on subsequent runs', function () {
        $thread = Thread::factory()->for($this->user)->create(['title' => 'My research thread']);

        $this->service->submit($this->user, $thread, $this->model, 'this is a new prompt');

        expect($thread->fresh()->title)->toBe('My research thread');
    });

    it('truncates long prompts to ~60 chars with an ellipsis', function () {
        $thread = Thread::factory()->for($this->user)->create(['title' => null]);
        $longPrompt = 'This is a very long prompt that goes well past the sixty character boundary and continues for a while';

        $this->service->submit($this->user, $thread, $this->model, $longPrompt);

        $title = $thread->fresh()->title;
        expect(mb_strlen($title))->toBeLessThanOrEqual(61); // 60 + ellipsis
        expect($title)->toEndWith('…');
        expect($title)->toStartWith('This is a very long prompt');
    });

    it('truncates at a word boundary when possible', function () {
        $thread = Thread::factory()->for($this->user)->create(['title' => null]);

        $this->service->submit(
            $this->user,
            $thread,
            $this->model,
            'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
        );

        // First 60 chars = "one two three four five six seven eight nine ten eleven twelv".
        // Last space at position 55 (after "eleven"). Trim back to it →
        // "one two three four five six seven eight nine ten eleven" + ellipsis.
        expect($thread->fresh()->title)
            ->toBe('one two three four five six seven eight nine ten eleven…');
    });
});

describe('validation failures', function () {
    it('throws ThreadOwnershipException when user does not own the thread', function () {
        $otherUser = User::factory()->create();
        $otherThread = Thread::factory()->for($otherUser)->create();

        expect(fn () => $this->service->submit($this->user, $otherThread, $this->model, 'hi'))
            ->toThrow(ThreadOwnershipException::class);
    });

    it('throws EmptyPromptException for empty / whitespace-only prompts', function () {
        foreach (['', '   ', "\n\t"] as $blank) {
            expect(fn () => $this->service->submit($this->user, $this->thread, $this->model, $blank))
                ->toThrow(EmptyPromptException::class);
        }
    });

    it('throws NoApiKeyException when user has no key for the vendor', function () {
        $anthropicModel = LlmModel::factory()->create(['vendor' => 'anthropic']);

        expect(fn () => $this->service->submit($this->user, $this->thread, $anthropicModel, 'hi'))
            ->toThrow(NoApiKeyException::class, "'anthropic'");
    });

    it('falls back from Meta to Together API key', function () {
        $metaModel = LlmModel::factory()->create([
            'vendor' => 'meta',
            'name' => 'llama-3.1-70b',
            'context_length' => 128000,
        ]);
        $userNoMeta = User::factory()->create();
        ApiKey::factory()->for($userNoMeta)->vendor('together')->create();
        $thread = Thread::factory()->for($userNoMeta)->create();

        // No 'meta' key, but a 'together' key — should succeed via fallback.
        $run = $this->service->submit($userNoMeta, $thread, $metaModel, 'hi');

        expect($run->status)->toBe(RunStatus::Pending);
    });

    it('throws InvalidParamsException for out-of-range temperature', function () {
        expect(fn () => $this->service->submit($this->user, $this->thread, $this->model, 'hi', ['temperature' => 3.0]))
            ->toThrow(InvalidParamsException::class, 'temperature');
        expect(fn () => $this->service->submit($this->user, $this->thread, $this->model, 'hi', ['temperature' => -0.1]))
            ->toThrow(InvalidParamsException::class, 'temperature');
    });

    it('throws InvalidParamsException for out-of-range top_p', function () {
        expect(fn () => $this->service->submit($this->user, $this->thread, $this->model, 'hi', ['top_p' => 1.5]))
            ->toThrow(InvalidParamsException::class, 'top_p');
    });

    it('throws InvalidParamsException for out-of-range top_k', function () {
        expect(fn () => $this->service->submit($this->user, $this->thread, $this->model, 'hi', ['top_k' => 600]))
            ->toThrow(InvalidParamsException::class, 'top_k');
        expect(fn () => $this->service->submit($this->user, $this->thread, $this->model, 'hi', ['top_k' => -1]))
            ->toThrow(InvalidParamsException::class, 'top_k');
    });

    it('throws InvalidParamsException for max_tokens < 1', function () {
        expect(fn () => $this->service->submit($this->user, $this->thread, $this->model, 'hi', ['max_tokens' => 0]))
            ->toThrow(InvalidParamsException::class, 'max_tokens');
    });

    it('throws ContextOverflowException when budget is exceeded', function () {
        $smallModel = LlmModel::factory()->create([
            'vendor' => 'openai',
            'context_length' => 10,
        ]);
        ApiKey::factory()->for($this->user)->vendor('openai')->withLabel('small')->create();

        $longPrompt = str_repeat('word ', 500);

        try {
            $this->service->submit($this->user, $this->thread, $smallModel, $longPrompt);
            expect()->fail('Expected exception');
        } catch (ContextOverflowException $e) {
            expect($e->result->fits)->toBeFalse();
            expect($e->result->overBy)->toBeGreaterThan(0);
        }
    });

    it('reserves max_tokens space in the budget check', function () {
        $smallModel = LlmModel::factory()->create([
            'vendor' => 'openai',
            'context_length' => 100,
        ]);
        ApiKey::factory()->for($this->user)->vendor('openai')->withLabel('small')->create();

        // Short prompt; budget would fit without reserve. With a 99-token
        // max_tokens reserve, the budget overflows.
        expect(fn () => $this->service->submit(
            $this->user, $this->thread, $smallModel,
            'hi there',
            ['max_tokens' => 99],
        ))->toThrow(ContextOverflowException::class);
    });
});

describe('privacy redaction', function () {
    it('stores prompt as null when user.store_prompts is false', function () {
        $privateUser = User::factory()->create(['store_prompts' => false]);
        $privateThread = Thread::factory()->for($privateUser)->create();
        ApiKey::factory()->for($privateUser)->vendor('openai')->create();

        $run = $this->service->submit($privateUser, $privateThread, $this->model, 'sensitive question');

        expect($run->prompt)->toBeNull();
        expect($run->conversation_history)->toBeNull();
        expect($run->prompt_hash)->toBe(hash('sha256', 'sensitive question'));
    });

    it('still stores prompt when store_prompts is true (default)', function () {
        $run = $this->service->submit($this->user, $this->thread, $this->model, 'a question');

        expect($run->prompt)->toBe('a question');
    });
});

describe('transactional integrity', function () {
    it('does not persist a run when the budget check fails', function () {
        // Fresh null-title thread so the assertion isolates the
        // service's transactional behavior from the factory default.
        $thread = Thread::factory()->for($this->user)->create([
            'title' => null,
            'last_activity_at' => null,
        ]);
        $smallModel = LlmModel::factory()->create([
            'vendor' => 'openai',
            'context_length' => 5,
        ]);
        ApiKey::factory()->for($this->user)->vendor('openai')->withLabel('small')->create();

        try {
            $this->service->submit($this->user, $thread, $smallModel, str_repeat('word ', 500));
        } catch (ContextOverflowException) {
            // expected
        }

        expect(Run::where('thread_id', $thread->id)->count())->toBe(0);
        expect($thread->fresh()->title)->toBeNull();
        expect($thread->fresh()->last_activity_at)->toBeNull();
    });
});
