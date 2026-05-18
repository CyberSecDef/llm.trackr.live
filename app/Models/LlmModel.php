<?php

namespace App\Models;

use App\Enums\ArchitectureType;
use App\Enums\PositionEncoding;
use Database\Factories\LlmModelFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Represents a row in the `models` table — a single LLM available
 * for selection in a run. Named `LlmModel` (not `Model`) so it
 * doesn't shadow Illuminate\Database\Eloquent\Model.
 */
class LlmModel extends Model
{
    /** @use HasFactory<LlmModelFactory> */
    use HasFactory;

    protected $table = 'models';

    /** @var list<string> */
    protected $fillable = [
        'vendor',
        'name',
        'display_name',
        'api_base_url',
        'architecture_type',
        'layers',
        'hidden_dim',
        'attention_heads',
        'moe_experts',
        'moe_active_experts',
        'position_encoding',
        'context_length',
        'pricing_input_per_million',
        'pricing_output_per_million',
        'supports_streaming',
        'supports_logprobs',
        'supports_seed',
        'supported_params',
        'chat_template',
        'manual_override',
        'metadata_estimated',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'architecture_type' => ArchitectureType::class,
            'position_encoding' => PositionEncoding::class,
            'layers' => 'integer',
            'hidden_dim' => 'integer',
            'attention_heads' => 'integer',
            'moe_experts' => 'integer',
            'moe_active_experts' => 'integer',
            'context_length' => 'integer',
            'pricing_input_per_million' => 'float',
            'pricing_output_per_million' => 'float',
            'supports_streaming' => 'boolean',
            'supports_logprobs' => 'boolean',
            'supports_seed' => 'boolean',
            'supported_params' => 'array',
            'manual_override' => 'boolean',
            'metadata_estimated' => 'boolean',
        ];
    }

    public function isMoe(): bool
    {
        return $this->architecture_type === ArchitectureType::Moe;
    }
}
