<?php

use Illuminate\Console\Scheduling\Schedule;

it('schedules registry:refresh weekly', function () {
    $schedule = app(Schedule::class);

    $matches = collect($schedule->events())
        ->filter(fn ($event) => str_contains($event->command ?? '', 'registry:refresh'))
        ->values();

    expect($matches)->toHaveCount(1);

    // weeklyOn(1, '03:00') = "0 3 * * 1" — minute 0, hour 3, any day of month,
    // any month, day-of-week = Monday (1).
    expect($matches->first()->expression)->toBe('0 3 * * 1');
});
