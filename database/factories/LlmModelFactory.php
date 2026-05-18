<?php

namespace Database\Factories;

use App\Enums\ArchitectureType;
use App\Enums\PositionEncoding;
use App\Models\LlmModel;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<LlmModel>
 */
class LlmModelFactory extends Factory
{
    protected $model = LlmModel::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $name = fake()->unique()->lexify('test-model-??????');

        return [
            'vendor' => fake()->randomElement(['openai', 'anthropic', 'google', 'meta', 'mistral']),
            'name' => $name,
            'display_name' => ucfirst(str_replace('-', ' ', $name)),
            'api_base_url' => null,
            'architecture_type' => ArchitectureType::Dense,
            'layers' => 32,
            'hidden_dim' => 4096,
            'attention_heads' => 32,
            'moe_experts' => null,
            'moe_active_experts' => null,
            'position_encoding' => PositionEncoding::Rope,
            'context_length' => 128_000,
            'pricing_input_per_million' => 2.50,
            'pricing_output_per_million' => 10.00,
            'supports_streaming' => true,
            'supports_logprobs' => false,
            'supports_seed' => false,
            'supported_params' => [
                'temperature' => true,
                'top_p' => true,
                'top_k' => false,
                'max_tokens' => true,
                'seed' => false,
            ],
            'chat_template' => null,
            'manual_override' => false,
            'metadata_estimated' => false,
        ];
    }

    public function moe(int $experts = 8, int $activeExperts = 2): static
    {
        return $this->state(fn () => [
            'architecture_type' => ArchitectureType::Moe,
            'moe_experts' => $experts,
            'moe_active_experts' => $activeExperts,
        ]);
    }

    public function vendor(string $vendor): static
    {
        return $this->state(fn () => ['vendor' => $vendor]);
    }

    public function estimated(): static
    {
        return $this->state(fn () => ['metadata_estimated' => true]);
    }

    public function manuallyOverridden(): static
    {
        return $this->state(fn () => ['manual_override' => true]);
    }
}
