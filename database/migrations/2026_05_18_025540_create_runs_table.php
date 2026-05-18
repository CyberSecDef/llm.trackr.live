<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('runs', function (Blueprint $table) {
            $table->id();

            $table->foreignId('thread_id')->constrained()->cascadeOnDelete();

            // Denormalized user_id for query speed (per SPEC §6). Kept
            // in sync by ThreadService at create time; never overrides
            // the thread's owner.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // restrictOnDelete: an admin trying to hard-delete a model
            // that still has runs gets a FK error rather than orphaning
            // historic data. Matches the M3-chunk-4 design note.
            $table->foreignId('model_id')->constrained('models')->restrictOnDelete();

            // 1-based ordinal within the thread. Unique with thread_id
            // so two runs can't both be "the third turn".
            $table->unsignedInteger('sequence_in_thread');

            // Prompt is nullable when the user has store_prompts=false
            // (SPEC §10.4). prompt_hash is always populated (SHA-256)
            // for deterministic replay seeding without revealing text.
            $table->text('prompt')->nullable();
            $table->string('prompt_hash', 64);

            // Snapshot of the history sent to the vendor at request
            // time. Stays even if the source rows change later.
            // [{role: "system"|"user"|"assistant", content: "..."}]
            $table->json('conversation_history')->nullable();

            // Inference parameters + model_snapshot used. JSON so the
            // shape can evolve without migrations:
            //   {temperature, top_p, top_k, max_tokens, seed,
            //    model_snapshot: { name, vendor, layers, ... }}
            $table->json('parameters')->nullable();

            // Token-level events captured during streaming. Used by
            // replay (M9) to reproduce the animation without re-calling
            // the vendor API. NULL while pending; populated as the
            // stream advances; final on terminal status.
            //   [{token: "...", logprobs?: [...], t_ms: int, layer_state?: {...}}]
            $table->json('token_log')->nullable();

            $table->text('output_text')->nullable();
            $table->unsignedInteger('input_tokens')->nullable();
            $table->unsignedInteger('output_tokens')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->decimal('tokens_per_second', 10, 2)->nullable();
            $table->decimal('estimated_cost', 12, 6)->nullable();

            // Lifecycle: pending | streaming | complete | error
            // (App\Enums\RunStatus). Defaults to pending; M6 streaming
            // pipeline drives the transitions.
            $table->string('status')->default('pending');
            $table->text('error_message')->nullable();

            $table->timestamps();

            $table->unique(['thread_id', 'sequence_in_thread']);
            $table->index('thread_id');
            $table->index('user_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('runs');
    }
};
