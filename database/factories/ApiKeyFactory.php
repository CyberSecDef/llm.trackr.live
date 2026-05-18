<?php

namespace Database\Factories;

use App\Models\ApiKey;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<ApiKey>
 */
class ApiKeyFactory extends Factory
{
    protected $model = ApiKey::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'vendor' => fake()->randomElement([
                'openai', 'anthropic', 'google', 'xai', 'mistral',
                'groq', 'together', 'huggingface',
            ]),
            'label' => null,
            'encrypted_key' => 'sk-test-' . Str::random(40),
            'last_used_at' => null,
        ];
    }

    public function vendor(string $vendor): static
    {
        return $this->state(fn () => ['vendor' => $vendor]);
    }

    public function withLabel(?string $label): static
    {
        return $this->state(fn () => ['label' => $label]);
    }

    public function withKey(string $plaintext): static
    {
        return $this->state(fn () => ['encrypted_key' => $plaintext]);
    }
}
