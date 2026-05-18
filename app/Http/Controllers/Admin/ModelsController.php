<?php

namespace App\Http\Controllers\Admin;

use App\Enums\ArchitectureType;
use App\Enums\PositionEncoding;
use App\Http\Controllers\Controller;
use App\Models\LlmModel;
use App\Services\ModelRegistry\RefreshService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class ModelsController extends Controller
{
    public function index(Request $request): Response
    {
        $search = (string) $request->query('search', '');
        $vendor = (string) $request->query('vendor', '');
        $arch = (string) $request->query('architecture', '');

        $query = LlmModel::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('display_name', 'like', "%{$search}%");
            });
        }

        if ($vendor !== '') {
            $query->where('vendor', $vendor);
        }

        if ($arch !== '') {
            $query->where('architecture_type', $arch);
        }

        $models = $query
            ->orderBy('vendor')
            ->orderBy('name')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (LlmModel $m) => [
                'id' => $m->id,
                'vendor' => $m->vendor,
                'name' => $m->name,
                'display_name' => $m->display_name,
                'architecture_type' => $m->architecture_type?->value,
                'context_length' => $m->context_length,
                'pricing_input_per_million' => $m->pricing_input_per_million,
                'pricing_output_per_million' => $m->pricing_output_per_million,
                'manual_override' => $m->manual_override,
                'metadata_estimated' => $m->metadata_estimated,
            ]);

        return Inertia::render('Admin/Models/Index', [
            'models' => $models,
            'filters' => [
                'search' => $search,
                'vendor' => $vendor,
                'architecture' => $arch,
            ],
            'vendors' => LlmModel::query()->distinct()->orderBy('vendor')->pluck('vendor'),
        ]);
    }

    public function edit(LlmModel $model): Response
    {
        return Inertia::render('Admin/Models/Edit', [
            'model' => [
                'id' => $model->id,
                'vendor' => $model->vendor,
                'name' => $model->name,
                'display_name' => $model->display_name,
                'api_base_url' => $model->api_base_url,
                'architecture_type' => $model->architecture_type?->value,
                'layers' => $model->layers,
                'hidden_dim' => $model->hidden_dim,
                'attention_heads' => $model->attention_heads,
                'moe_experts' => $model->moe_experts,
                'moe_active_experts' => $model->moe_active_experts,
                'position_encoding' => $model->position_encoding?->value,
                'context_length' => $model->context_length,
                'pricing_input_per_million' => $model->pricing_input_per_million,
                'pricing_output_per_million' => $model->pricing_output_per_million,
                'supports_streaming' => $model->supports_streaming,
                'supports_logprobs' => $model->supports_logprobs,
                'supports_seed' => $model->supports_seed,
                'chat_template' => $model->chat_template,
                'manual_override' => $model->manual_override,
                'metadata_estimated' => $model->metadata_estimated,
            ],
            'architectureTypes' => array_map(fn ($c) => $c->value, ArchitectureType::cases()),
            'positionEncodings' => array_map(fn ($c) => $c->value, PositionEncoding::cases()),
        ]);
    }

    public function update(Request $request, LlmModel $model): RedirectResponse
    {
        $validated = $request->validate([
            'vendor' => ['required', 'string', 'max:64'],
            'display_name' => ['nullable', 'string', 'max:255'],
            'api_base_url' => ['nullable', 'string', 'max:512'],
            'architecture_type' => ['nullable', 'string', 'in:dense,moe'],
            'layers' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'hidden_dim' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'attention_heads' => ['nullable', 'integer', 'min:1', 'max:1024'],
            'moe_experts' => ['nullable', 'integer', 'min:0', 'max:1024'],
            'moe_active_experts' => ['nullable', 'integer', 'min:0', 'max:1024'],
            'position_encoding' => ['nullable', 'string', 'in:rope,alibi,learned'],
            'context_length' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'pricing_input_per_million' => ['nullable', 'numeric', 'min:0'],
            'pricing_output_per_million' => ['nullable', 'numeric', 'min:0'],
            'supports_streaming' => ['required', 'boolean'],
            'supports_logprobs' => ['required', 'boolean'],
            'supports_seed' => ['required', 'boolean'],
            'chat_template' => ['nullable', 'string', 'max:10000'],
            'manual_override' => ['required', 'boolean'],
        ]);

        $model->update($validated);

        return redirect()
            ->route('admin.models.index')
            ->with('status', "model-updated:{$model->id}");
    }

    public function destroy(LlmModel $model): RedirectResponse
    {
        $name = $model->name;
        $model->delete();

        return redirect()
            ->route('admin.models.index')
            ->with('status', "model-deleted:{$name}");
    }

    public function refresh(RefreshService $service): RedirectResponse
    {
        try {
            $result = $service->refresh();

            return redirect()
                ->route('admin.models.index')
                ->with('status', "refresh-complete:{$result->summary()}");
        } catch (Throwable $e) {
            return redirect()
                ->route('admin.models.index')
                ->withErrors(['refresh' => 'Refresh failed: ' . $e->getMessage()]);
        }
    }
}
