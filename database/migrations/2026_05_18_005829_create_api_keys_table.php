<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('api_keys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Vendor matches `models.vendor` — e.g. 'openai', 'anthropic',
            // 'google', 'xai', 'mistral', 'groq', 'together', 'huggingface'.
            $table->string('vendor');

            // Optional user-supplied label so a user can hold multiple keys
            // per vendor (e.g. "personal" + "work"). Nullable; default null
            // means "the default key for this vendor".
            $table->string('label')->nullable();

            // Encrypted via Eloquent's `encrypted` cast (AES-256-CBC,
            // tied to APP_KEY). Stored as text since ciphertext is base64.
            $table->text('encrypted_key');

            // Last 4 plaintext characters cached for UI masking — saves a
            // decrypt per row in the list view. Low marginal info leak:
            // an attacker with DB read access plausibly also has APP_KEY.
            $table->string('last_four', 4);

            // Updated by the vendor-client layer (M4 chunk 2+) every time
            // the key is used. Lets admin spot dormant keys.
            $table->timestamp('last_used_at')->nullable();

            $table->timestamps();

            // SPEC §6: a user can have multiple keys per vendor as long as
            // their labels differ. A null label counts as one slot.
            $table->unique(['user_id', 'vendor', 'label']);
            $table->index(['user_id', 'vendor']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('api_keys');
    }
};
