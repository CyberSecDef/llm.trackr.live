<?php

use App\Enums\UserRole;
use App\Models\User;
use App\Notifications\RegistryRefreshFailed;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Weekly model-registry refresh from OpenRouter + the local architecture
// metadata fixture. Monday 03:00 UTC is intentionally off-peak so a
// transient OpenRouter blip doesn't coincide with active use. On failure
// we email every admin so the staleness banner (chunk 5) isn't the first
// signal something is wrong.
Schedule::command('registry:refresh')
    ->weeklyOn(1, '03:00')
    ->onFailure(function () {
        $admins = User::where('role', UserRole::Admin)->get();
        if ($admins->isEmpty()) {
            return;
        }

        Notification::send(
            $admins,
            new RegistryRefreshFailed(
                errorMessage: 'Scheduled registry:refresh exited with a non-zero status.',
                output: null,
            ),
        );
    });
