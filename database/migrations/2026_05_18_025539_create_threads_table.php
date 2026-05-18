<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('threads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Auto-titled from first 60 chars of first prompt; editable.
            $table->string('title')->nullable();

            // Thread-level system prompt. Pre-fills each new run's
            // conversation_history; runs can carry their own as a snapshot
            // for replay determinism.
            $table->text('system_prompt')->nullable();

            // Preferred model + params for new runs in this thread. The
            // user can override per-run; these just save them clicking
            // the same model again. FK is set null on model delete so
            // a removed model doesn't break the whole thread.
            $table->foreignId('default_model_id')->nullable()
                ->constrained('models')->nullOnDelete();
            $table->json('default_parameters')->nullable();

            $table->boolean('archived')->default(false);
            $table->json('tags')->nullable();

            // Per-thread sharing (SPEC §3.6, wired in M11). Unique-indexed
            // so the share URL → thread lookup is O(1).
            $table->string('share_token', 64)->nullable()->unique();
            $table->timestamp('share_enabled_at')->nullable();

            // Updated by the run-submission layer (M5 chunk 4 + later)
            // to drive the threads-list "last activity" column.
            $table->timestamp('last_activity_at')->nullable();

            $table->timestamps();

            $table->index('user_id');
            $table->index('archived');
            $table->index('last_activity_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('threads');
    }
};
