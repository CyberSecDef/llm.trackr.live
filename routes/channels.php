<?php

use App\Models\Run;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

/*
 * Private channel for a single run's streaming events (M6).
 *
 * Authorization: only the user who owns the run gets through. We resolve
 * by ID rather than via route-model binding because Pusher channel-auth
 * routes don't run the route binder — they call this callback directly
 * with the raw `{runId}` from the channel name.
 *
 * Returning a non-null truthy value (here: `true`) authorizes the
 * subscription. Returning `false` or `null` rejects it. We never leak
 * whether a missing run is "not yours" vs "doesn't exist" — both paths
 * just return `false`.
 */
Broadcast::channel('runs.{runId}', function (User $user, $runId) {
    $run = Run::find((int) $runId);

    return $run !== null && $run->user_id === $user->id;
});
