<?php

use App\Http\Controllers\Auth\SocialiteController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
})->name('home');

// Placeholder login route. Chunk 3 of M2 will replace this with a
// dedicated Login Inertia page. For now, the Welcome page already
// shows the three provider buttons, so we just rerender Welcome.
Route::get('login', function () {
    return Inertia::render('Welcome', [
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
})->name('login');

// Social authentication (Google / Microsoft / Facebook).
Route::prefix('auth')->group(function () {
    Route::get('{provider}/redirect', [SocialiteController::class, 'redirect'])
        ->name('auth.redirect');
    Route::get('{provider}/callback', [SocialiteController::class, 'callback'])
        ->name('auth.callback');
});

Route::post('logout', [SocialiteController::class, 'logout'])
    ->middleware('auth')
    ->name('logout');

// Placeholder dashboard. Chunk 3 of M2 builds the real UI.
Route::get('dashboard', function () {
    return Inertia::render('Dashboard');
})->middleware('auth')->name('dashboard');
