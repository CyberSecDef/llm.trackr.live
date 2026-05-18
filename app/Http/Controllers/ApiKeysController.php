<?php

namespace App\Http\Controllers;

use App\Models\ApiKey;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ApiKeysController extends Controller
{
    /**
     * Vendor allowlist for new keys. Mirrors the SPEC §3.2.2 vendor list
     * and is the same set the model registry uses. Kept here so the UI
     * dropdown and validation share a single source.
     */
    public const SUPPORTED_VENDORS = [
        'openai',
        'anthropic',
        'google',
        'xai',
        'mistral',
        'groq',
        'together',
        'huggingface',
    ];

    public function index(Request $request): Response
    {
        $keys = $request->user()
            ->apiKeys()
            ->orderBy('vendor')
            ->orderBy('label')
            ->get()
            ->map(fn (ApiKey $k) => [
                'id' => $k->id,
                'vendor' => $k->vendor,
                'label' => $k->label,
                'last_four' => $k->last_four,
                'masked' => $k->maskedDisplay(),
                'last_used_at' => $k->last_used_at?->toIso8601String(),
                'created_at' => $k->created_at?->toIso8601String(),
            ]);

        return Inertia::render('ApiKeys/Index', [
            'apiKeys' => $keys,
            'supportedVendors' => self::SUPPORTED_VENDORS,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'vendor' => ['required', 'string', 'in:' . implode(',', self::SUPPORTED_VENDORS)],
            'label' => ['nullable', 'string', 'max:64'],
            'key' => ['required', 'string', 'min:8', 'max:512'],
        ]);

        // Manually enforce the unique (user_id, vendor, label) constraint
        // with a clear validation error instead of relying on the DB to
        // throw a UniqueConstraintViolationException.
        $existing = $request->user()->apiKeys()
            ->where('vendor', $validated['vendor'])
            ->where('label', $validated['label'] ?? null)
            ->exists();

        if ($existing) {
            return back()->withErrors([
                'label' => 'A key with this vendor and label already exists. Use a different label or delete the existing key first.',
            ]);
        }

        $request->user()->apiKeys()->create([
            'vendor' => $validated['vendor'],
            'label' => $validated['label'] ?? null,
            'encrypted_key' => $validated['key'],
        ]);

        return redirect()->route('api-keys.index')->with('status', 'api-key-added');
    }

    public function destroy(Request $request, ApiKey $apiKey): RedirectResponse
    {
        // Authorization: a user can only delete their own keys. Admin
        // status doesn't grant access to other users' keys (those are
        // encrypted with APP_KEY but storing other users' secrets in
        // an admin-accessible surface would defeat BYOK trust).
        abort_unless($apiKey->user_id === $request->user()->id, 403);

        $apiKey->delete();

        return redirect()->route('api-keys.index')->with('status', "api-key-deleted:{$apiKey->vendor}");
    }
}
