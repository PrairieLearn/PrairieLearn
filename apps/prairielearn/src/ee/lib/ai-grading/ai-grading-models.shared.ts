import type { EnumAiGradingProvider } from '../../../lib/db-types.js';

/**
 * Default per-million-token pricing used to compute relative cost multipliers.
 * These mirror the defaults in config.ts but are duplicated here so this file
 * can be imported on both client and server.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5-mini-2025-08-07': { input: 0.25, output: 2 },
  'gpt-5.1-2025-11-13': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-3-flash-preview': { input: 0.5, output: 3 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-opus-4-5': { input: 5, output: 25 },
};

const BASELINE_INPUT_TOKENS = 1_000;
const BASELINE_OUTPUT_TOKENS = 500;
const BASELINE_REASONING_TOKENS = 200;

function computeRelativeCosts(): Record<string, string> {
  const totalOutputTokens = BASELINE_OUTPUT_TOKENS + BASELINE_REASONING_TOKENS;
  const costs = Object.entries(MODEL_PRICING).map(([modelId, pricing]) => ({
    modelId,
    cost: pricing.input * BASELINE_INPUT_TOKENS + pricing.output * totalOutputTokens,
  }));
  const minCost = Math.min(...costs.map((c) => c.cost));
  return Object.fromEntries(
    costs.map(({ modelId, cost }) => {
      const multiplier = cost / minCost;
      // Truncate to one decimal place (not rounded).
      const truncated = Math.floor(multiplier * 10) / 10;
      const label = truncated === 1 ? '1x' : `${truncated % 1 === 0 ? truncated.toFixed(0) : truncated.toFixed(1)}x`;
      return [modelId, label];
    }),
  );
}

export const AI_GRADING_RELATIVE_COSTS = computeRelativeCosts();

export const AI_GRADING_MODELS = [
  {
    provider: 'openai',
    modelId: 'gpt-5-mini-2025-08-07',
    name: 'GPT 5-mini',
    sublabel: 'Fast and affordable',
  },
  {
    provider: 'openai',
    modelId: 'gpt-5.1-2025-11-13',
    name: 'GPT 5.1',
    sublabel: 'Best accuracy',
  },
  {
    provider: 'google',
    modelId: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    sublabel: 'Most affordable',
  },
  {
    provider: 'google',
    modelId: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    sublabel: 'Fast and affordable',
  },
  {
    provider: 'google',
    modelId: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    sublabel: 'Best accuracy',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    sublabel: 'Fast and affordable',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    sublabel: 'Balanced accuracy and speed',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    sublabel: 'Best accuracy',
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

export const AI_GRADING_PROVIDER_SUBLABELS: Record<EnumAiGradingProvider, string> = {
  openai: 'General grading',
  google: 'Images and multimodal',
  anthropic: 'Code and reasoning',
};

export const AI_GRADING_PROVIDER_OPTIONS = AI_GRADING_PROVIDERS.map((provider) => ({
  value: provider,
  label: AI_GRADING_PROVIDER_DISPLAY_NAMES[provider],
}));

/**
 * Users without the ai-grading-model-selection feature flag enabled must use the default model.
 */
export const DEFAULT_AI_GRADING_MODEL = 'gpt-5-mini-2025-08-07' as const;
