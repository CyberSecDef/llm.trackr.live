<?php

use App\Models\ApiKey;
use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * GET/PATCH/DELETE /threads/{thread} — thread detail surface (M7 chunk 5).
 *
 * Ownership is the central invariant: every action requires
 * `$thread->user_id === $request->user()->id` and returns 403 to any
 * non-owner. Delete cascades to runs via the FK; tests check both the
 * thread row AND its run rows are gone.
 */

describe('GET /threads/{thread} — auth & ownership', function () {
    it('redirects unauthenticated callers to login', function () {
        $thread = Thread::factory()->create();

        $this->get("/threads/{$thread->id}")->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = Thread::factory()->for($owner)->create();

        $this->actingAs($stranger)->get("/threads/{$thread->id}")->assertForbidden();
    });

    it('returns 404 for a nonexistent thread', function () {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/threads/999999')->assertNotFound();
    });
});

describe('GET /threads/{thread} — render shape', function () {
    it('renders the Threads/Show component with the expected props', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create([
            'title' => 'Quantum entanglement',
            'tags' => ['research', 'physics'],
        ]);

        $this->actingAs($user)->get("/threads/{$thread->id}")->assertInertia(
            fn ($page) => $page
                ->component('Threads/Show')
                ->where('thread.id', $thread->id)
                ->where('thread.title', 'Quantum entanglement')
                ->where('thread.tags', ['research', 'physics'])
                ->has('runs')
                ->has('usable_models')
                ->has('has_api_keys')
        );
    });

    it('returns runs ordered by sequence_in_thread', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        // Insert in reverse order to prove the ORDER BY does work.
        foreach ([3, 1, 2] as $seq) {
            Run::factory()->for($user)->for($thread)->create([
                'sequence_in_thread' => $seq,
                'prompt' => "prompt {$seq}",
            ]);
        }

        $this->actingAs($user)->get("/threads/{$thread->id}")->assertInertia(
            fn ($page) => $page
                ->has('runs', 3)
                ->where('runs.0.sequence_in_thread', 1)
                ->where('runs.1.sequence_in_thread', 2)
                ->where('runs.2.sequence_in_thread', 3)
        );
    });

    it('does not leak another user\'s runs into the response', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $ownerThread = Thread::factory()->for($owner)->create();
        $strangerThread = Thread::factory()->for($stranger)->create();
        Run::factory()->for($stranger)->for($strangerThread)->create([
            'sequence_in_thread' => 1,
            'prompt' => 'STRANGER',
        ]);

        $this->actingAs($owner)->get("/threads/{$ownerThread->id}")->assertInertia(
            fn ($page) => $page->has('runs', 0)
        );
    });

    it('returns models for vendors the user has keys for', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        ApiKey::factory()->for($user)->vendor('openai')->create();
        LlmModel::factory()->vendor('openai')->create(['display_name' => 'GPT-A']);
        LlmModel::factory()->vendor('openai')->create(['display_name' => 'GPT-B']);
        LlmModel::factory()->vendor('anthropic')->create(['display_name' => 'Claude']);

        $this->actingAs($user)->get("/threads/{$thread->id}")->assertInertia(
            fn ($page) => $page->has('usable_models', 2)
        );
    });

    it('honors the Meta→Together API-key fallback in usable_models', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        ApiKey::factory()->for($user)->vendor('together')->create();
        LlmModel::factory()->vendor('meta')->create(['display_name' => 'Llama']);
        LlmModel::factory()->vendor('together')->create(['display_name' => 'Mixtral']);

        $this->actingAs($user)->get("/threads/{$thread->id}")->assertInertia(
            fn ($page) => $page->has('usable_models', 2)
        );
    });

    it('returns empty usable_models when the user has no keys', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        LlmModel::factory()->vendor('openai')->create();

        $this->actingAs($user)->get("/threads/{$thread->id}")->assertInertia(
            fn ($page) => $page
                ->where('has_api_keys', false)
                ->has('usable_models', 0)
        );
    });

    it('includes architecture + capacity + pricing fields in each usable_models entry (M7 chunk 7)', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        ApiKey::factory()->for($user)->vendor('openai')->create();
        LlmModel::factory()->vendor('openai')->moe(experts: 8, activeExperts: 2)->create([
            'display_name' => 'GPT-MoE',
            'hidden_dim' => 4096,
            'attention_heads' => 32,
            'layers' => 80,
            'context_length' => 128_000,
            'pricing_input_per_million' => 5.00,
            'pricing_output_per_million' => 15.00,
        ]);

        $this->actingAs($user)->get("/threads/{$thread->id}")->assertInertia(
            fn ($page) => $page
                ->has('usable_models', 1)
                ->where('usable_models.0.architecture_type', 'moe')
                ->where('usable_models.0.layers', 80)
                ->where('usable_models.0.hidden_dim', 4096)
                ->where('usable_models.0.attention_heads', 32)
                ->where('usable_models.0.moe_experts', 8)
                ->where('usable_models.0.moe_active_experts', 2)
                ->where('usable_models.0.context_length', 128_000)
                // Numeric round-trip: PHP encodes 5.00 as "5", so the
                // assertion compares to int. Same pattern as the chunk-3
                // dashboard cost field.
                ->where('usable_models.0.pricing_input_per_million', 5)
                ->where('usable_models.0.pricing_output_per_million', 15)
                ->has('usable_models.0.position_encoding')
        );
    });
});

describe('PATCH /threads/{thread} — update', function () {
    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = Thread::factory()->for($owner)->create();

        $this->actingAs($stranger)
            ->patch("/threads/{$thread->id}", ['title' => 'hijacked'])
            ->assertForbidden();
    });

    it('updates the title', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create(['title' => 'old']);

        $this->actingAs($user)
            ->patch("/threads/{$thread->id}", ['title' => 'New title']);

        expect($thread->fresh()->title)->toBe('New title');
    });

    it('allows nulling the title', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create(['title' => 'old']);

        $this->actingAs($user)
            ->patch("/threads/{$thread->id}", ['title' => null]);

        expect($thread->fresh()->title)->toBeNull();
    });

    it('rejects a title longer than 200 chars with 422', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        $this->actingAs($user)
            ->patchJson("/threads/{$thread->id}", ['title' => str_repeat('x', 201)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['title']);
    });

    it('toggles the archived flag', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create(['archived' => false]);

        $this->actingAs($user)
            ->patch("/threads/{$thread->id}", ['archived' => true]);

        expect($thread->fresh()->archived)->toBeTrue();

        $this->actingAs($user)
            ->patch("/threads/{$thread->id}", ['archived' => false]);

        expect($thread->fresh()->archived)->toBeFalse();
    });
});

describe('DELETE /threads/{thread} — destroy', function () {
    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $thread = Thread::factory()->for($owner)->create();

        $this->actingAs($stranger)->delete("/threads/{$thread->id}")->assertForbidden();
        expect(Thread::find($thread->id))->not->toBeNull();
    });

    it('deletes the thread and redirects to /threads', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();

        $this->actingAs($user)
            ->delete("/threads/{$thread->id}")
            ->assertRedirect('/threads');

        expect(Thread::find($thread->id))->toBeNull();
    });

    it('cascades runs via the FK', function () {
        $user = User::factory()->create();
        $thread = Thread::factory()->for($user)->create();
        Run::factory()->for($user)->for($thread)->create(['sequence_in_thread' => 1]);
        Run::factory()->for($user)->for($thread)->create(['sequence_in_thread' => 2]);

        $this->actingAs($user)->delete("/threads/{$thread->id}");

        expect(Run::where('thread_id', $thread->id)->count())->toBe(0);
    });
});
