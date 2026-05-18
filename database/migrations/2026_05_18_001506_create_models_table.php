<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('models', function (Blueprint $table) {
            $table->id();

            // Vendor + canonical API name.
            $table->string('vendor');                             // 'openai' | 'anthropic' | 'google' | ...
            $table->string('name')->unique();                     // canonical API ID, e.g. 'gpt-4o'
            $table->string('display_name')->nullable();
            $table->string('api_base_url')->nullable();

            // Architecture metadata — nullable because OpenRouter doesn't supply
            // these; they come from database/seeders/data/architecture_metadata.php
            // (built in M3 chunk 2) and from admin edits.
            $table->string('architecture_type')->nullable();      // 'dense' | 'moe' (cast to ArchitectureType enum)
            $table->unsignedInteger('layers')->nullable();
            $table->unsignedInteger('hidden_dim')->nullable();
            $table->unsignedInteger('attention_heads')->nullable();
            $table->unsignedInteger('moe_experts')->nullable();
            $table->unsignedInteger('moe_active_experts')->nullable();
            $table->string('position_encoding')->nullable();      // 'rope' | 'alibi' | 'learned'

            // Capabilities / capacity.
            $table->unsignedInteger('context_length')->nullable();
            $table->decimal('pricing_input_per_million', 12, 6)->nullable();
            $table->decimal('pricing_output_per_million', 12, 6)->nullable();
            $table->boolean('supports_streaming')->default(true);
            $table->boolean('supports_logprobs')->default(false);
            $table->boolean('supports_seed')->default(false);
            $table->json('supported_params')->nullable();         // {"temperature": true, "top_p": true, ...}
            $table->text('chat_template')->nullable();            // jinja2-ish template string

            // Registry-refresh control flags.
            $table->boolean('manual_override')->default(false);   // true = future refreshes skip this row
            $table->boolean('metadata_estimated')->default(false); // true = layers/hidden_dim/etc are best-guess

            $table->timestamps();

            $table->index('vendor');
            $table->index('architecture_type');
            $table->index('manual_override');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('models');
    }
};
