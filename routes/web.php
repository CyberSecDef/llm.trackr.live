<?php

use App\Http\Controllers\Admin\ModelsController as AdminModelsController;
use App\Http\Controllers\Admin\UsersController as AdminUsersController;
use App\Http\Controllers\ApiKeysController;
use App\Http\Controllers\Auth\SocialiteController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DebugRunController;
use App\Http\Controllers\RunController;
use App\Http\Controllers\RunEventsController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\StreamRunController;
use App\Models\User;
use Illuminate\Foundation\Application;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Public landing. Signed-in users skip straight to the dashboard.
Route::get('/', function () {
    if (Auth::check()) {
        return redirect()->route('dashboard');
    }

    return Inertia::render('Welcome', [
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
})->name('home');

// Sign-in page. Signed-in users skip straight to the dashboard.
Route::get('login', function () {
    if (Auth::check()) {
        return redirect()->route('dashboard');
    }

    return Inertia::render('Login');
})->name('login');

// Social authentication (Google / Microsoft / Facebook).
Route::prefix('auth')->group(function () {
    Route::get('{provider}/redirect', [SocialiteController::class, 'redirect'])
        ->name('auth.redirect');
    Route::get('{provider}/callback', [SocialiteController::class, 'callback'])
        ->name('auth.callback');
});

// Authenticated app.
Route::middleware('auth')->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])
        ->name('dashboard');

    // Placeholder pages — full IA visible from day one, each routes to a
    // ComingSoon view that calls out the milestone where the feature lands.
    Route::get('threads', fn () => Inertia::render('ComingSoon', [
        'feature' => 'Threads',
        'milestone' => 'M5',
    ]))->name('threads.index');

    // For non-admins this is a placeholder until M7 ships the public
    // model browser. Admins get sent to the registry admin page.
    Route::get('models', function () {
        if (request()->user()?->isAdmin()) {
            return redirect()->route('admin.models.index');
        }

        return Inertia::render('ComingSoon', [
            'feature' => 'Models',
            'milestone' => 'M7',
        ]);
    })->name('models.index');

    Route::get('api-keys', [ApiKeysController::class, 'index'])->name('api-keys.index');
    Route::post('api-keys', [ApiKeysController::class, 'store'])->name('api-keys.store');
    Route::delete('api-keys/{apiKey}', [ApiKeysController::class, 'destroy'])->name('api-keys.destroy');

    Route::get('settings', [SettingsController::class, 'show'])->name('settings');
    Route::patch('settings', [SettingsController::class, 'update'])->name('settings.update');

    // Run submission. Throttled per-user via the 'runs' RateLimiter
    // registered in AppServiceProvider (live-reads users.max_runs_per_hour).
    // The thread is route-bound; ownership is verified inside RunService
    // so the same invariant holds for any future internal-API caller.
    Route::post('threads/{thread}/runs', [RunController::class, 'store'])
        ->middleware('throttle:runs')
        ->name('threads.runs.store');

    // Internal debug view of a run's streaming events. Owner-only.
    // Real visualization page lands in M8 — this is the bare-bones
    // 'is the pipeline alive?' view.
    Route::get('runs/{run}/debug', [DebugRunController::class, 'show'])
        ->name('runs.debug');

    // SSE fallback for clients that can't establish a WebSocket
    // connection (M6 chunk 5a). Long-lived response; ties up an FPM
    // worker for the duration — see StreamRunController docblock for
    // the deployment sizing note.
    Route::get('runs/{run}/stream', [StreamRunController::class, 'stream'])
        ->name('runs.stream');

    // JSON backfill for WS reconnects (M6 chunk 6). Cheap one-shot
    // call the hook makes when pusher reconnects so the client can
    // catch up on events missed during the disconnect window.
    Route::get('runs/{run}/events', [RunEventsController::class, 'index'])
        ->name('runs.events');

    // Admin-only routes.
    Route::middleware('admin')->prefix('admin')->name('admin.')->group(function () {
        Route::get('users', [AdminUsersController::class, 'index'])->name('users.index');
        Route::patch('users/{user}', [AdminUsersController::class, 'update'])->name('users.update');

        Route::get('models', [AdminModelsController::class, 'index'])->name('models.index');
        Route::post('models/refresh', [AdminModelsController::class, 'refresh'])->name('models.refresh');
        Route::get('models/{model}/edit', [AdminModelsController::class, 'edit'])->name('models.edit');
        Route::patch('models/{model}', [AdminModelsController::class, 'update'])->name('models.update');
        Route::delete('models/{model}', [AdminModelsController::class, 'destroy'])->name('models.destroy');
    });

    Route::post('logout', [SocialiteController::class, 'logout'])
        ->name('logout');
});

// Dev-only magic login. Bypasses OAuth so a phone on the LAN can log
// in without configuring a real Google/MS/Facebook redirect URI for
// the LAN IP. Companion to `php artisan dev:login` — the command
// produces a signed URL that hits this handler.
//
// 404s outside `local` so this never works in staging/prod. The
// route is always registered (avoids the boot-time vs run-time
// confusion that an `if (app()->environment(...))` wrap creates and
// makes the route testable); the runtime abort_unless is what
// enforces the gate. Belt-and-braces with the command's own env
// check, which refuses to even generate URLs outside `local`.
Route::get('dev/login/{user}', function (User $user, Request $request) {
    abort_unless(app()->environment('local'), 404);
    abort_unless($request->hasValidSignature(), 403, 'Signature missing or expired.');
    Auth::login($user);
    $request->session()->regenerate();

    return redirect()->route('dashboard');
})->name('dev.login');
