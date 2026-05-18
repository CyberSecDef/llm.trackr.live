<?php

namespace App\Http\Middleware;

use App\Models\RegistryMeta;
use App\Services\ModelRegistry\RefreshService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * Registry data is considered stale after this many days without a
     * successful refresh. Per SPEC §7.1.
     */
    public const STALENESS_THRESHOLD_DAYS = 14;

    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => [
                'user' => fn () => $request->user() ? [
                    'id' => $request->user()->id,
                    'name' => $request->user()->name,
                    'email' => $request->user()->email,
                    'avatar_url' => $request->user()->avatar_url,
                    'role' => $request->user()->role->value,
                ] : null,
            ],
            'flash' => [
                'status' => fn () => $request->session()->get('status'),
            ],
            'registry' => fn () => $this->registryStaleness(),
        ];
    }

    /**
     * Shape consumed by the staleness banner in AppLayout. `last_refresh_at`
     * is null when the registry has never been successfully refreshed
     * (fresh install before the first run of `php artisan registry:refresh`).
     *
     * @return array{
     *     is_stale: bool,
     *     days_stale: int|null,
     *     last_refresh_at: string|null,
     * }
     */
    private function registryStaleness(): array
    {
        $meta = RegistryMeta::getValue(RefreshService::META_LAST_SUCCESSFUL_REFRESH);
        $atString = $meta['at'] ?? null;

        if (! is_string($atString)) {
            return [
                'is_stale' => true,
                'days_stale' => null,
                'last_refresh_at' => null,
            ];
        }

        $at = Carbon::parse($atString);
        $daysStale = (int) $at->diffInDays(Carbon::now());

        return [
            'is_stale' => $daysStale >= self::STALENESS_THRESHOLD_DAYS,
            'days_stale' => $daysStale,
            'last_refresh_at' => $at->toIso8601String(),
        ];
    }
}
