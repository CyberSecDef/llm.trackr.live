<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class RegistryRefreshFailed extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $errorMessage,
        public readonly ?string $output = null,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->error()
            ->subject('[LLM-Viz] Weekly registry refresh failed')
            ->greeting('Heads up,')
            ->line('The scheduled `registry:refresh` job failed.')
            ->line('Error:')
            ->line($this->errorMessage);

        if ($this->output) {
            $mail->line('Command output:')
                ->line($this->output);
        }

        return $mail
            ->line('The model registry was not updated. Investigate via:')
            ->line('  php artisan registry:refresh')
            ->action('View the project', config('app.url'));
    }
}
