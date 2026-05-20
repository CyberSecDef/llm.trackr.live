<?php

use App\Http\Controllers\Admin\ModelsController as AdminModelsController;
use App\Http\Controllers\Admin\UsersController as AdminUsersController;
use App\Http\Controllers\ApiKeysController;
use App\Http\Controllers\Auth\SocialiteController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DebugRunController;
use App\Http\Controllers\ExportDownloadController;
use App\Http\Controllers\ExportTriggerController;
use App\Http\Controllers\PromptPreviewController;
use App\Http\Controllers\ReplayController;
use App\Http\Controllers\RunController;
use App\Http\Controllers\RunEventsController;
use App\Http\Controllers\RunExportController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\StreamRunController;
use App\Http\Controllers\ThreadController;
use App\Http\Controllers\ThreadExportController;
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

    // Threads list — search / filter / paginated (M7 chunk 4).
    Route::get('threads', [ThreadController::class, 'index'])->name('threads.index');
    Route::post('threads', [ThreadController::class, 'store'])->name('threads.store');

    // Thread detail (M7 chunk 5). show / update (title + archive) /
    // destroy (cascades runs via FK). Ownership enforced by the
    // controller's abort_unless on every action.
    Route::get('threads/{thread}', [ThreadController::class, 'show'])->name('threads.show');
    Route::patch('threads/{thread}', [ThreadController::class, 'update'])->name('threads.update');
    Route::delete('threads/{thread}', [ThreadController::class, 'destroy'])
        ->name('threads.destroy');

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

    // Prompt-input preview: returns history + token counts + budget
    // for the prompt-input panel (M7 chunk 6a). Same-user gate. Cheap
    // enough to call on a debounce as the user types.
    Route::post('threads/{thread}/preview', [PromptPreviewController::class, 'show'])
        ->name('threads.preview');

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

    // Replay of a terminal run (M9 chunk 1). The token_log column is
    // re-synthesized into the same RunEvent[] shape the live pipeline
    // emits; MoE expert routing stays deterministic per (run.id,
    // token_index) so a replay is frame-identical to the original
    // generation per SPEC §10.1.
    Route::get('threads/{thread}/runs/{run}/replay', [ReplayController::class, 'show'])
        ->name('threads.runs.replay');

    // JSON export of a single run (M9 chunk 3). Owner-only.
    // Content-Disposition: attachment → browser downloads as
    // run-{id}.json instead of rendering inline.
    Route::get('runs/{run}/export.json', [RunExportController::class, 'show'])
        ->name('runs.export');

    // JSON export of a whole thread (M9 chunk 4). Owner-only.
    // Returns the same schema as the single-run export but with a
    // `runs: []` array instead of a `run: {}` object.
    Route::get('threads/{thread}/export.json', [ThreadExportController::class, 'show'])
        ->name('threads.export');

    // GIF/MP4 export trigger + download (M10 chunk 5). Owner-only.
    // POST /runs/{id}/export — cache hit returns URLs immediately;
    // cache miss dispatches ExportRunGif and 202s. The frontend
    // waits for ExportCompleted on private-runs.{id}.
    Route::post('runs/{run}/export', [ExportTriggerController::class, 'store'])
        ->name('runs.export.trigger');
    Route::get('runs/{run}/exports/{format}', [ExportDownloadController::class, 'show'])
        ->where('format', 'gif|mp4')
        ->name('runs.exports.show');

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
