<?php

namespace Database\Factories;

use App\Models\Thread;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Thread>
 */
class ThreadFactory extends Factory
{
    protected $model = Thread::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'title' => fake()->sentence(6),
            'system_prompt' => null,
            'default_model_id' => null,
            'default_parameters' => null,
            'archived' => false,
            'tags' => null,
            'share_token' => null,
            'share_enabled_at' => null,
            'last_activity_at' => null,
        ];
    }

    public function archived(): static
    {
        return $this->state(fn () => ['archived' => true]);
    }

    public function shared(?string $token = null): static
    {
        return $this->state(fn () => [
            'share_token' => $token ?? Str::random(32),
            'share_enabled_at' => now(),
        ]);
    }

    public function withSystemPrompt(string $prompt): static
    {
        return $this->state(fn () => ['system_prompt' => $prompt]);
    }
}
