import type { EnumAiGradingProvider } from '../../../lib/db-types.js';

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
  google: 'Gemini models',
  anthropic: 'Claude models',
};

export const AI_GRADING_PROVIDER_OPTIONS = AI_GRADING_PROVIDERS.map((provider) => ({
  value: provider,
  label: AI_GRADING_PROVIDER_DISPLAY_NAMES[provider],
}));

/**
 * Users without the ai-grading-model-selection feature flag enabled must use the default model.
 */
export const DEFAULT_AI_GRADING_MODEL = 'gpt-5-mini-2025-08-07' as const;
