<?php

use App\Enums\UserRole;
use App\Models\User;
use App\Notifications\RegistryRefreshFailed;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

it('sends the failure notification to all admin users', function () {
    Notification::fake();

    $adminA = User::factory()->admin()->create();
    $adminB = User::factory()->admin()->create();
    $regular = User::factory()->create();

    $admins = User::where('role', UserRole::Admin)->get();
    Notification::send($admins, new RegistryRefreshFailed('boom'));

    Notification::assertSentTo($adminA, RegistryRefreshFailed::class);
    Notification::assertSentTo($adminB, RegistryRefreshFailed::class);
    Notification::assertNotSentTo($regular, RegistryRefreshFailed::class);
});

it('renders the failure notification with the error message', function () {
    $admin = User::factory()->admin()->create();
    $notification = new RegistryRefreshFailed('OpenRouter timed out', 'optional output blob');

    $mail = $notification->toMail($admin);

    // Subject + body sanity checks. MailMessage stringifies via render()
    // but the raw structure is easier to assert against.
    expect($mail->subject)->toContain('registry refresh failed');
    expect(implode(' ', $mail->introLines))->toContain('OpenRouter timed out');
    expect(implode(' ', $mail->introLines))->toContain('optional output blob');
});

it('declares mail as the only notification channel', function () {
    $notification = new RegistryRefreshFailed('boom');
    $admin = User::factory()->admin()->create();

    expect($notification->via($admin))->toBe(['mail']);
});
