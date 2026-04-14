import type { EnumAiGradingProvider } from '../../../lib/db-types.js';

const BASELINE_INPUT_TOKENS = 1_000;
const BASELINE_OUTPUT_TOKENS = 500;
const BASELINE_REASONING_TOKENS = 200;

/**
 * Computes relative cost multipliers for AI grading models given per-model
 * pricing. Call this on the server where config values are available, then
 * pass the result to the frontend as a prop.
 */
export function computeAiGradingRelativeCosts(
  pricing: Record<string, { input: number; output: number }>,
): Record<string, string> {
  const totalOutputTokens = BASELINE_OUTPUT_TOKENS + BASELINE_REASONING_TOKENS;
  const models = AI_GRADING_MODELS.map((m) => {
    const p = pricing[m.modelId] as { input: number; output: number } | undefined;
    if (!p) {
      throw new Error(`Missing pricing for AI grading model: ${m.modelId}`);
    }
    return {
      modelId: m.modelId,
      cost: p.input * BASELINE_INPUT_TOKENS + p.output * totalOutputTokens,
    };
  });
  const minCost = Math.min(...models.map((m) => m.cost));
  return Object.fromEntries(
    models.map(({ modelId, cost }) => {
      const multiplier = cost / minCost;
      // Truncate to one decimal place (not rounded).
      const truncated = Math.floor(multiplier * 10) / 10;
      const label =
        truncated === 1
          ? '1x'
          : `${truncated % 1 === 0 ? truncated.toFixed(0) : truncated.toFixed(1)}x`;
      return [modelId, label];
    }),
  );
}

export const AI_GRADING_MODELS = [
  {
    provider: 'openai',
    modelId: 'gpt-5-mini-2025-08-07',
    name: 'GPT 5-mini',
    sublabel: 'Good for most grading tasks',
    recommended: true,
  },
  {
    provider: 'openai',
    modelId: 'gpt-5.1-2025-11-13',
    name: 'GPT 5.1',
    sublabel: 'Best for text-based submissions',
    recommended: true,
  },
  {
    provider: 'google',
    modelId: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    sublabel: 'Best for handwriting and images',
    recommended: true,
  },
  {
    provider: 'google',
    modelId: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    sublabel: 'Lower-cost image grading',
    recommended: false,
  },
  {
    provider: 'google',
    modelId: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    sublabel: 'Fast, accurate image grading',
    recommended: false,
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    sublabel: 'Fast code grading',
    recommended: false,
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    sublabel: 'Balanced code grading',
    recommended: false,
  },
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    sublabel: 'Best for code submissions',
    recommended: false,
  },
] as const;

export type AiGradingModelId = (typeof AI_GRADING_MODELS)[number]['modelId'];

export const AI_GRADING_MODEL_IDS: AiGradingModelId[] = AI_GRADING_MODELS.map(
  (model) => model.modelId,
);

export const AI_GRADING_MODEL_PROVIDERS = {
  'gpt-5-mini-2025-08-07': 'openai',
  'gpt-5.1-2025-11-13': 'openai',
  'gemini-2.5-flash': 'google',
  'gemini-3-flash-preview': 'google',
  'gemini-3.1-pro-preview': 'google',
  'claude-haiku-4-5': 'anthropic',
  'claude-sonnet-4-5': 'anthropic',
  'claude-opus-4-5': 'anthropic',
} as const;

/**
 * The unique set of provider identifiers derived from the models list.
 */
const AI_GRADING_PROVIDERS = [...new Set(AI_GRADING_MODELS.map((m) => m.provider))] as const;

export const AI_GRADING_PROVIDER_DISPLAY_NAMES: Record<EnumAiGradingProvider, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
};

export const AI_GRADING_PROVIDER_OPTIONS = AI_GRADING_PROVIDERS.map((provider) => ({
  value: provider,
  label: AI_GRADING_PROVIDER_DISPLAY_NAMES[provider],
}));

/**
 * Fallback model used when no prior model has been selected.
 */
export const DEFAULT_AI_GRADING_MODEL = 'gpt-5-mini-2025-08-07' as const;
