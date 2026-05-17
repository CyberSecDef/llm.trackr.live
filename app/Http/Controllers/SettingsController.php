<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function show(Request $request): Response
    {
        return Inertia::render('Settings', [
            'storePrompts' => $request->user()->store_prompts,
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'store_prompts' => ['required', 'boolean'],
        ]);

        $request->user()->update([
            'store_prompts' => $validated['store_prompts'],
        ]);

        return redirect()->route('settings')->with('status', 'settings-saved');
    }
}
