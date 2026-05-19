/*
 * Sub-component list rendered in the click-to-zoom overlay
 * (M8 chunk 2). The architecture flag toggles the FFN block
 * between a dense MLP and an MoE router→experts step.
 *
 * Order matches the SPEC's transformer block:
 *   RMSNorm → Attention → Residual → FFN/MoE → Residual
 */

export interface SubComponent {
    name: string;
    description: string;
}

const DENSE_SUBCOMPONENTS: SubComponent[] = [
    { name: 'RMSNorm', description: 'Root-mean-square pre-norm.' },
    { name: 'Attention', description: 'Multi-head self-attention.' },
    { name: 'Residual', description: 'Add & route around the attention block.' },
    { name: 'FFN', description: 'Dense gated feed-forward (SwiGLU / GeGLU).' },
    { name: 'Residual', description: 'Add & route around the FFN block.' },
];

const MOE_SUBCOMPONENTS: SubComponent[] = [
    { name: 'RMSNorm', description: 'Root-mean-square pre-norm.' },
    { name: 'Attention', description: 'Multi-head self-attention.' },
    { name: 'Residual', description: 'Add & route around the attention block.' },
    {
        name: 'MoE Router → Experts',
        description: 'Top-K router dispatches to FFN experts.',
    },
    { name: 'Residual', description: 'Add & route around the MoE block.' },
];

export function subComponentsFor(architectureType: string | null | undefined): SubComponent[] {
    return architectureType === 'moe' ? MOE_SUBCOMPONENTS : DENSE_SUBCOMPONENTS;
}
