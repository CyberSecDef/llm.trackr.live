<?php

namespace Database\Factories;

use App\Enums\RunStatus;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Run>
 */
class RunFactory extends Factory
{
    protected $model = Run::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        // Build a prompt + hash so the default factory state matches the
        // ALWAYS-populated invariant on prompt_hash.
        $prompt = fake()->sentence();

        return [
            'thread_id' => Thread::factory(),
            'user_id' => User::factory(),
            'model_id' => LlmModel::factory(),
            'sequence_in_thread' => 1,
            'prompt' => $prompt,
            'prompt_hash' => hash('sha256', $prompt),
            'conversation_history' => null,
            'parameters' => ['temperature' => 0.7],
            'token_log' => null,
            'output_text' => null,
            'input_tokens' => null,
            'output_tokens' => null,
            'duration_ms' => null,
            'tokens_per_second' => null,
            'estimated_cost' => null,
            'status' => RunStatus::Pending,
            'error_message' => null,
        ];
    }

    public function streaming(): static
    {
        return $this->state(fn () => ['status' => RunStatus::Streaming]);
    }

    public function complete(): static
    {
        return $this->state(fn () => [
            'status' => RunStatus::Complete,
            'output_text' => 'completion text',
            'input_tokens' => 10,
            'output_tokens' => 20,
            'duration_ms' => 1500,
            'tokens_per_second' => 13.33,
            'estimated_cost' => 0.0012,
            'token_log' => [
                ['token' => 'completion', 't_ms' => 100],
                ['token' => ' text', 't_ms' => 200],
            ],
        ]);
    }

    public function errored(string $message = 'something went wrong'): static
    {
        return $this->state(fn () => [
            'status' => RunStatus::Error,
            'error_message' => $message,
        ]);
    }

    public function privacyRedacted(): static
    {
        return $this->state(fn () => [
            // store_prompts=false path: prompt nulled, prompt_hash kept.
            'prompt' => null,
            'conversation_history' => null,
        ]);
    }
}
