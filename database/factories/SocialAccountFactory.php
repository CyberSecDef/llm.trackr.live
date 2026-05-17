<?php

namespace Database\Factories;

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SocialAccount>
 */
class SocialAccountFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'provider' => fake()->randomElement(['google', 'microsoft', 'facebook']),
            'provider_user_id' => (string) fake()->unique()->numerify('##############'),
        ];
    }

    public function google(): static
    {
        return $this->state(fn () => ['provider' => 'google']);
    }

    public function microsoft(): static
    {
        return $this->state(fn () => ['provider' => 'microsoft']);
    }

    public function facebook(): static
    {
        return $this->state(fn () => ['provider' => 'facebook']);
    }
}
