<?php

use App\Http\Controllers\Admin\UsersController as AdminUsersController;
use App\Http\Controllers\Auth\SocialiteController;
use App\Http\Controllers\SettingsController;
use Illuminate\Foundation\Application;
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
    Route::get('dashboard', fn () => Inertia::render('Dashboard'))
        ->name('dashboard');

    // Placeholder pages — full IA visible from day one, each routes to a
    // ComingSoon view that calls out the milestone where the feature lands.
    Route::get('threads', fn () => Inertia::render('ComingSoon', [
        'feature' => 'Threads',
        'milestone' => 'M5',
    ]))->name('threads.index');

    Route::get('models', fn () => Inertia::render('ComingSoon', [
        'feature' => 'Models',
        'milestone' => 'M3',
    ]))->name('models.index');

    Route::get('api-keys', fn () => Inertia::render('ComingSoon', [
        'feature' => 'API Keys',
        'milestone' => 'M4',
    ]))->name('api-keys.index');

    Route::get('settings', [SettingsController::class, 'show'])->name('settings');
    Route::patch('settings', [SettingsController::class, 'update'])->name('settings.update');

    // Admin-only routes.
    Route::middleware('admin')->prefix('admin')->name('admin.')->group(function () {
        Route::get('users', [AdminUsersController::class, 'index'])->name('users.index');
        Route::patch('users/{user}', [AdminUsersController::class, 'update'])->name('users.update');
    });

    Route::post('logout', [SocialiteController::class, 'logout'])
        ->name('logout');
});
