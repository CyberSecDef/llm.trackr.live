<?php

use App\Events\Runs\ExportCompleted;
use App\Jobs\ExportRunGif;
use App\Models\Run;
use App\Models\User;
use App\Services\Exports\ChromiumDetector;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('local');
    config()->set('gif_export.storage_disk', 'local');
});

describe('POST /runs/{run}/export — auth', function () {
    it('redirects unauthenticated callers to login', function () {
        $run = Run::factory()->create();

        $this->post("/runs/{$run->id}/export")->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $run = Run::factory()->for($owner)->create();

        $this->actingAs($stranger)
            ->post("/runs/{$run->id}/export")
            ->assertForbidden();
    });
});

describe('POST /runs/{run}/export — cache hit', function () {
    it('returns 200 with both URLs immediately when both files exist', function () {
        Bus::fake();
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();
        Storage::disk('local')->put("exports/{$run->id}.gif", 'GIF89a...');
        Storage::disk('local')->put("exports/{$run->id}.mp4", 'mp4...');

        $response = $this->actingAs($user)->postJson("/runs/{$run->id}/export");

        $response->assertOk()
            ->assertJson([
                'ready' => true,
                'gif_url' => "http://localhost/runs/{$run->id}/exports/gif",
                'mp4_url' => "http://localhost/runs/{$run->id}/exports/mp4",
                'fallback_engaged' => false,
            ]);
        Bus::assertNotDispatched(ExportRunGif::class);
    });

    it('returns fallback_engaged=true when puppeteer is configured but Chromium is missing (chunk 6)', function () {
        Event::fake([ExportCompleted::class]);
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();
        Storage::disk('local')->put("exports/{$run->id}.gif", 'x');
        Storage::disk('local')->put("exports/{$run->id}.mp4", 'x');

        config()->set('gif_export.renderer', 'puppeteer');
        app()->instance(
            ChromiumDetector::class,
            new ChromiumDetector(['/never']),
        );

        $response = $this->actingAs($user)->postJson("/runs/{$run->id}/export");
        $response->assertOk()->assertJson(['fallback_engaged' => true]);

        // The broadcast should also carry fallback_engaged=true.
        Event::assertDispatched(
            ExportCompleted::class,
            fn ($e) => $e->fallbackEngaged === true,
        );
    });

    it('broadcasts ExportCompleted on cache hit so other tabs flip state', function () {
        Event::fake([ExportCompleted::class]);
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();
        Storage::disk('local')->put("exports/{$run->id}.gif", 'x');
        Storage::disk('local')->put("exports/{$run->id}.mp4", 'x');

        $this->actingAs($user)->postJson("/runs/{$run->id}/export");

        Event::assertDispatched(ExportCompleted::class, fn ($e) => $e->run->id === $run->id);
    });
});

describe('POST /runs/{run}/export — cache miss', function () {
    it('dispatches ExportRunGif + returns 202 queued', function () {
        Bus::fake();
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();

        $response = $this->actingAs($user)->postJson("/runs/{$run->id}/export");

        $response->assertStatus(202)
            ->assertJson([
                'ready' => false,
                'status' => 'queued',
                'fallback_engaged' => false,
            ]);
        Bus::assertDispatched(ExportRunGif::class, fn ($job) => $job->runId === $run->id);
    });

    it('does NOT broadcast ExportCompleted on cache miss (the job will broadcast later)', function () {
        Event::fake([ExportCompleted::class]);
        Bus::fake();
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();

        $this->actingAs($user)->postJson("/runs/{$run->id}/export");

        Event::assertNotDispatched(ExportCompleted::class);
    });
});
