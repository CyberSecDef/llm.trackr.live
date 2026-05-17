<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UsersController extends Controller
{
    public function index(): Response
    {
        $users = User::query()
            ->orderByDesc('created_at')
            ->paginate(20)
            ->through(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar_url' => $user->avatar_url,
                'role' => $user->role->value,
                'max_runs_per_hour' => $user->max_runs_per_hour,
                'created_at' => $user->created_at?->toIso8601String(),
            ]);

        return Inertia::render('Admin/Users', [
            'users' => $users,
        ]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $validated = $request->validate([
            'max_runs_per_hour' => ['required', 'integer', 'min:0', 'max:10000'],
        ]);

        $user->update([
            'max_runs_per_hour' => $validated['max_runs_per_hour'],
        ]);

        return redirect()
            ->route('admin.users.index')
            ->with('status', "rate-limit-updated:{$user->id}");
    }
}
