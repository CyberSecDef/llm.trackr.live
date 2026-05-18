<?php

use App\Models\LlmModel;
use App\Models\Run;
use App\Models\Thread;
use App\Models\User;
use App\Services\Threads\ThreadService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(ThreadService::class);
});

describe('create()', function () {
    it('creates a thread owned by the given user', function () {
        $user = User::factory()->create();

        $thread = $this->service->create($user);

        expect($thread->user_id)->toBe($user->id);
        expect($thread->title)->toBeNull();
        expect($thread->system_prompt)->toBeNull();
        expect($thread->archived)->toBeFalse();
        expect($thread->exists)->toBeTrue();
    });

    it('stores supplied attributes', function () {
        $user = User::factory()->create();
        $model = LlmModel::factory()->create();

        $thread = $this->service->create($user, [
            'title' => 'M5 chunk planning',
            'system_prompt' => 'be concise',
            'default_model_id' => $model->id,
            'default_parameters' => ['temperature' => 0.5],
            'tags' => ['phase1', 'planning'],
        ]);

        expect($thread->title)->toBe('M5 chunk planning');
        expect($thread->system_prompt)->toBe('be concise');
        expect($thread->default_model_id)->toBe($model->id);
        expect($thread->default_parameters)->toBe(['temperature' => 0.5]);
        expect($thread->tags)->toBe(['phase1', 'planning']);
    });

    it('trims whitespace from the title or leaves it null', function () {
        $user = User::factory()->create();

        expect($this->service->create($user, ['title' => '   '])->title)->toBeNull();
        expect($this->service->create($user, ['title' => '  hello  '])->title)->toBe('hello');
    });
});

describe('rename()', function () {
    it('updates the title', function () {
        $thread = Thread::factory()->create(['title' => 'old']);

        $this->service->rename($thread, 'new');

        expect($thread->fresh()->title)->toBe('new');
    });

    it('trims whitespace from the new title', function () {
        $thread = Thread::factory()->create();

        $this->service->rename($thread, '  trimmed  ');

        expect($thread->fresh()->title)->toBe('trimmed');
    });

    it('rejects an empty title with InvalidArgumentException', function () {
        $thread = Thread::factory()->create(['title' => 'kept']);

        expect(fn () => $this->service->rename($thread, '   '))
            ->toThrow(InvalidArgumentException::class, 'cannot be empty');

        expect($thread->fresh()->title)->toBe('kept');
    });
});

describe('archive() / unarchive()', function () {
    it('archives an active thread', function () {
        $thread = Thread::factory()->create(['archived' => false]);

        $this->service->archive($thread);

        expect($thread->fresh()->archived)->toBeTrue();
    });

    it('unarchives an archived thread', function () {
        $thread = Thread::factory()->archived()->create();

        $this->service->unarchive($thread);

        expect($thread->fresh()->archived)->toBeFalse();
    });

    it('does not touch last_activity_at when archiving', function () {
        $thread = Thread::factory()->create(['last_activity_at' => null]);

        $this->service->archive($thread);

        expect($thread->fresh()->last_activity_at)->toBeNull();
    });
});

describe('tag()', function () {
    it('replaces the tags list', function () {
        $thread = Thread::factory()->create(['tags' => ['old']]);

        $this->service->tag($thread, ['new', 'phase1']);

        expect($thread->fresh()->tags)->toBe(['new', 'phase1']);
    });

    it('dedupes the tags list', function () {
        $thread = Thread::factory()->create();

        $this->service->tag($thread, ['a', 'b', 'a', 'c', 'b']);

        expect($thread->fresh()->tags)->toBe(['a', 'b', 'c']);
    });

    it('drops empty and whitespace-only entries', function () {
        $thread = Thread::factory()->create();

        $this->service->tag($thread, ['  ', 'real', '', "\t"]);

        expect($thread->fresh()->tags)->toBe(['real']);
    });

    it('trims surrounding whitespace from each tag', function () {
        $thread = Thread::factory()->create();

        $this->service->tag($thread, ['  research  ', "planning\t"]);

        expect($thread->fresh()->tags)->toBe(['research', 'planning']);
    });

    it('preserves user casing (case-sensitive dedupe)', function () {
        $thread = Thread::factory()->create();

        // Distinct casings stay distinct — someone tagging "AI" vs "ai"
        // is probably distinguishing them deliberately.
        $this->service->tag($thread, ['AI', 'ai', 'AI']);

        expect($thread->fresh()->tags)->toBe(['AI', 'ai']);
    });

    it('clears the tags when given an empty array', function () {
        $thread = Thread::factory()->create(['tags' => ['old']]);

        $this->service->tag($thread, []);

        expect($thread->fresh()->tags)->toBeNull();
    });

    it('clears the tags when given null', function () {
        $thread = Thread::factory()->create(['tags' => ['old']]);

        $this->service->tag($thread, null);

        expect($thread->fresh()->tags)->toBeNull();
    });
});

describe('delete()', function () {
    it('removes the thread', function () {
        $thread = Thread::factory()->create();

        $this->service->delete($thread);

        expect(Thread::find($thread->id))->toBeNull();
    });

    it('cascades to the thread\'s runs', function () {
        $thread = Thread::factory()->create();
        Run::factory()->for($thread)->count(3)->create([
            'sequence_in_thread' => fn () => fake()->unique()->numberBetween(1, 1000),
        ]);
        expect(Run::count())->toBe(3);

        $this->service->delete($thread);

        expect(Run::count())->toBe(0);
    });
});
