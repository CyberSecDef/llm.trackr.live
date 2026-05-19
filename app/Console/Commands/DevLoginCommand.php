<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\URL;

/**
 * Issue a one-shot magic login URL for a user — local-env-only.
 *
 * The real login path is OAuth via Socialite (M2). That's fine on
 * desktop where the redirect URIs are configured, but a hassle on
 * a phone visiting via the LAN IP (different host = OAuth provider
 * rejects the redirect URI). This command sidesteps it: print a
 * signed URL, paste/open on the target device, and it logs the
 * user in for one visit.
 *
 * Security: refuses to run outside the `local` env. The signed URL
 * itself is 15-minute scoped and tied to the host that generated
 * it (use --host to override APP_URL when generating for a
 * different host, e.g. the LAN IP). The signed-route handler in
 * routes/web.php is also gated on `local`.
 */
class DevLoginCommand extends Command
{
    /** @var string */
    protected $signature = 'dev:login
        {email? : User email; will create the user if not found.}
        {--host= : Base URL the signed link should use (defaults to APP_URL).}
        {--minutes=15 : Validity window in minutes.}';

    /** @var string */
    protected $description = 'Issue a one-shot signed login URL for a user (local env only).';

    public function handle(): int
    {
        if (! app()->environment('local')) {
            $this->error('Refusing to run outside the local environment.');

            return self::FAILURE;
        }

        $email = $this->argument('email') ?? $this->ask('User email');
        if (! is_string($email) || $email === '') {
            $this->error('Email is required.');

            return self::FAILURE;
        }

        $user = User::firstWhere('email', $email);
        if (! $user) {
            if (! $this->confirm("No user with email {$email} — create one (admin role)?", true)) {
                return self::FAILURE;
            }
            $user = User::create([
                'name' => 'Dev User',
                'email' => $email,
                'role' => UserRole::Admin,
                'email_verified_at' => now(),
            ]);
            $this->info("Created user #{$user->id} ({$user->email}).");
        }

        if (is_string($this->option('host')) && $this->option('host') !== '') {
            URL::forceRootUrl($this->option('host'));
        }

        $minutes = max(1, (int) $this->option('minutes'));
        $url = URL::temporarySignedRoute(
            'dev.login',
            now()->addMinutes($minutes),
            ['user' => $user->id],
        );

        $this->info("Magic login URL (valid {$minutes} min):");
        $this->line($url);

        return self::SUCCESS;
    }
}
