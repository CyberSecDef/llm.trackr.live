<?php

use App\Http\Middleware\EnsureUserIsAdmin;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Inertia\Inertia;
use Sentry\Laravel\Integration;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        channels: __DIR__ . '/../routes/channels.php',
        web: __DIR__ . '/../routes/web.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'admin' => EnsureUserIsAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        Integration::handles($exceptions);

        // Render error pages via Inertia in non-debug environments
        // (M7 chunk 2). In `local` / `testing` with APP_DEBUG=true,
        // Laravel's whoops/stack-trace pages still fire — useful while
        // developing. Production gets the React shells from
        // resources/js/Pages/Errors/*.tsx.
        $exceptions->respond(function (Response $response, Throwable $exception, $request) {
            if (config('app.debug') && ! $request->expectsJson()) {
                return $response;
            }
            if ($request->expectsJson()) {
                return $response;
            }

            $status = $response->getStatusCode();
            $component = match ($status) {
                403 => 'Errors/Forbidden',
                404 => 'Errors/NotFound',
                419 => 'Errors/Expired',
                500, 503 => 'Errors/ServerError',
                default => null,
            };
            if ($component === null) {
                return $response;
            }

            return Inertia::render($component)
                ->toResponse($request)
                ->setStatusCode($status);
        });
    })->create();
