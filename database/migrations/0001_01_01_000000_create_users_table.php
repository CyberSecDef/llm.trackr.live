<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('avatar_url')->nullable();
            $table->string('role')->default('user');
            $table->boolean('store_prompts')->default(true);
            $table->unsignedInteger('max_runs_per_hour')->default(30);
            $table->rememberToken();
            $table->timestamps();
        });

        // No password_reset_tokens table — this app uses social OAuth only
        // (Google, Microsoft, Facebook). See SPEC §3.2.4.

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('users');
    }
};
