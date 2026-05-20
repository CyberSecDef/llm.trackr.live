<?php

use App\Events\Runs\ExportCompleted;
use App\Events\Runs\ExportFailed;
use App\Jobs\ExportRunGif;
use App\Models\Run;
use App\Services\Exports\GifRenderer;
use App\Services\Exports\RenderConfig;
use App\Services\Exports\RenderResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

/**
 * In-memory test double — records every render() call so the
 * tests can assert dispatch + arguments without touching a real
 * renderer.
 */
class FakeRenderer implements GifRenderer
{
    /** @var list<array{run_id: int, config: RenderConfig}> */
    public array $calls = [];

    public function render(Run $run, RenderConfig $config): RenderResult
    {
        $this->calls[] = ['run_id' => $run->id, 'config' => $config];

        return new RenderResult(
            gifPath: "exports/{$run->id}.gif",
            mp4Path: "exports/{$run->id}.mp4",
            framesCount: 1,
            durationMs: 33,
        );
    }
}

beforeEach(function () {
    Storage::fake('local');
    config()->set('gif_export.storage_disk', 'local');
    // M10 chunk 5: the job now dispatches ExportCompleted/ExportFailed
    // (ShouldBroadcastNow). Fake both globally so existing tests
    // don't try to hit Pusher. Per-test cases that ASSERT the events
    // re-fake inside the test body.
    Event::fake([
        ExportCompleted::class,
        ExportFailed::class,
    ]);
});

describe('ExportRunGif dispatch', function () {
    it('is dispatchable via the bus', function () {
        Bus::fake();
        ExportRunGif::dispatch(42);
        Bus::assertDispatched(ExportRunGif::class, fn ($job) => $job->runId === 42);
    });
});

describe('ExportRunGif event dispatch (M10 chunk 5)', function () {
    it('dispatches ExportCompleted on a successful render', function () {
        $run = Run::factory()->create();
        $fake = new FakeRenderer;
        $this->app->instance(GifRenderer::class, $fake);
        Event::fake([ExportCompleted::class]);

        ExportRunGif::dispatchSync($run->id);

        Event::assertDispatched(
            ExportCompleted::class,
            fn ($e) => $e->run->id === $run->id,
        );
    });

    it('dispatches ExportCompleted on a cache hit (no renderer call)', function () {
        $run = Run::factory()->create();
        Storage::disk('local')->put("exports/{$run->id}.gif", 'G');
        Storage::disk('local')->put("exports/{$run->id}.mp4", 'M');

        $fake = new FakeRenderer;
        $this->app->instance(GifRenderer::class, $fake);
        Event::fake([ExportCompleted::class]);

        ExportRunGif::dispatchSync($run->id);

        expect($fake->calls)->toBeEmpty();
        Event::assertDispatched(
            ExportCompleted::class,
        );
    });

    it('dispatches ExportFailed (then rethrows) when the renderer throws', function () {
        $run = Run::factory()->create();
        $throwing = new class implements GifRenderer
        {
            public function render(Run $run, RenderConfig $config): RenderResult
            {
                throw new RuntimeException('renderer crashed');
            }
        };
        $this->app->instance(GifRenderer::class, $throwing);
        Event::fake([ExportFailed::class]);

        try {
            ExportRunGif::dispatchSync($run->id);
            expect()->fail('expected rethrow');
        } catch (RuntimeException $e) {
            expect($e->getMessage())->toBe('renderer crashed');
        }

        Event::assertDispatched(
            ExportFailed::class,
            fn ($e) => $e->run->id === $run->id && $e->message === 'renderer crashed',
        );
    });
});

describe('ExportRunGif handle()', function () {
    it('calls the renderer with the run + a RenderConfig', function () {
        $run = Run::factory()->create();
        $fake = new FakeRenderer;
        $this->app->instance(GifRenderer::class, $fake);

        ExportRunGif::dispatchSync($run->id);

        expect($fake->calls)->toHaveCount(1);
        expect($fake->calls[0]['run_id'])->toBe($run->id);
        expect($fake->calls[0]['config'])->toBeInstanceOf(RenderConfig::class);
        expect($fake->calls[0]['config']->frameRate)->toBe(30);
    });

    it('respects gif_export.frame_rate config when building the RenderConfig', function () {
        $run = Run::factory()->create();
        $fake = new FakeRenderer;
        $this->app->instance(GifRenderer::class, $fake);
        config()->set('gif_export.frame_rate', 24);

        ExportRunGif::dispatchSync($run->id);

        expect($fake->calls[0]['config']->frameRate)->toBe(24);
    });

    it('cache-hit short-circuits when both export files exist', function () {
        $run = Run::factory()->create();
        Storage::disk('local')->put("exports/{$run->id}.gif", 'GIF89a...');
        Storage::disk('local')->put("exports/{$run->id}.mp4", 'mp4...');

        $fake = new FakeRenderer;
        $this->app->instance(GifRenderer::class, $fake);

        ExportRunGif::dispatchSync($run->id);

        expect($fake->calls)->toBeEmpty();
    });

    it('cache MISS when only one file exists (treated as partial render)', function () {
        $run = Run::factory()->create();
        // Only the .gif made it to disk last time. .mp4 missing → re-render.
        Storage::disk('local')->put("exports/{$run->id}.gif", 'GIF89a...');

        $fake = new FakeRenderer;
        $this->app->instance(GifRenderer::class, $fake);

        ExportRunGif::dispatchSync($run->id);

        expect($fake->calls)->toHaveCount(1);
    });

    it('handles a missing run gracefully (logs + returns)', function () {
        $fake = new FakeRenderer;
        $this->app->instance(GifRenderer::class, $fake);

        // No run with id 9_999_999 exists; job should not crash.
        ExportRunGif::dispatchSync(9_999_999);

        expect($fake->calls)->toBeEmpty();
    });

    it('job class declares tries=1 and timeout=300 (5-minute SPEC cap)', function () {
        $job = new ExportRunGif(1);
        expect($job->tries)->toBe(1);
        expect($job->timeout)->toBe(300);
    });
});
