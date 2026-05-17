<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('user:promote {email : The email of the user to promote}')]
#[Description('Promote a registered user to admin role.')]
class PromoteUser extends Command
{
    public function handle(): int
    {
        $email = (string) $this->argument('email');

        $user = User::where('email', $email)->first();

        if (! $user) {
            $this->error("No user found with email: {$email}");
            $this->line('Hint: the user must sign in at least once before they can be promoted.');

            return self::FAILURE;
        }

        if ($user->isAdmin()) {
            $this->info("User {$email} is already an admin. No change.");

            return self::SUCCESS;
        }

        $user->update(['role' => UserRole::Admin]);
        $this->info("Promoted {$email} to admin.");

        return self::SUCCESS;
    }
}
