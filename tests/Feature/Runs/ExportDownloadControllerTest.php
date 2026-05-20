<?php

use App\Models\Run;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('local');
    config()->set('gif_export.storage_disk', 'local');
});

describe('GET /runs/{run}/exports/{format} — auth', function () {
    it('redirects unauthenticated callers to login', function () {
        $run = Run::factory()->create();
        Storage::disk('local')->put("exports/{$run->id}.gif", 'x');

        $this->get("/runs/{$run->id}/exports/gif")->assertRedirect();
    });

    it('returns 403 for a non-owner', function () {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $run = Run::factory()->for($owner)->create();
        Storage::disk('local')->put("exports/{$run->id}.gif", 'x');

        $this->actingAs($stranger)
            ->get("/runs/{$run->id}/exports/gif")
            ->assertForbidden();
    });
});

describe('GET /runs/{run}/exports/{format} — format validation', function () {
    it('rejects formats other than gif/mp4 with 404 (route constraint)', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();

        // The route has ->where('format', 'gif|mp4'). Other formats
        // fail the constraint at the routing layer with 404.
        $this->actingAs($user)
            ->get("/runs/{$run->id}/exports/webm")
            ->assertNotFound();
    });
});

describe('GET /runs/{run}/exports/{format} — happy path', function () {
    it('returns 404 when the file does not exist on disk', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();

        $this->actingAs($user)
            ->get("/runs/{$run->id}/exports/gif")
            ->assertNotFound();
    });

    it('serves the GIF with image/gif content type + run-{id}.gif filename', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();
        Storage::disk('local')->put("exports/{$run->id}.gif", 'GIF89a-stub');

        $response = $this->actingAs($user)->get("/runs/{$run->id}/exports/gif");

        $response->assertOk();
        expect($response->headers->get('Content-Type'))->toContain('image/gif');
        $cd = $response->headers->get('Content-Disposition');
        expect($cd)->toContain("run-{$run->id}.gif");
    });

    it('serves the MP4 with video/mp4 content type + run-{id}.mp4 filename', function () {
        $user = User::factory()->create();
        $run = Run::factory()->for($user)->create();
        Storage::disk('local')->put("exports/{$run->id}.mp4", 'mp4-stub');

        $response = $this->actingAs($user)->get("/runs/{$run->id}/exports/mp4");

        $response->assertOk();
        expect($response->headers->get('Content-Type'))->toContain('video/mp4');
        $cd = $response->headers->get('Content-Disposition');
        expect($cd)->toContain("run-{$run->id}.mp4");
    });
});
