export const AI_GRADING_MODELS = [
  { provider: 'openai', modelId: 'gpt-5-mini-2025-08-07', name: 'OpenAI GPT 5-mini' },
  { provider: 'openai', modelId: 'gpt-5.1-2025-11-13', name: 'OpenAI GPT 5.1' },
  { provider: 'google', modelId: 'gemini-2.5-flash', name: 'Google Gemini 2.5 Flash' },
  { provider: 'google', modelId: 'gemini-3-flash-preview', name: 'Google Gemini 3 Flash Preview' },
  { provider: 'google', modelId: 'gemini-3-pro-preview', name: 'Google Gemini 3 Pro Preview' },
  { provider: 'anthropic', modelId: 'claude-haiku-4-5', name: 'Anthropic Claude Haiku 4.5' },
  { provider: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'Anthropic Claude Sonnet 4.5' },
  { provider: 'anthropic', modelId: 'claude-opus-4-5', name: 'Anthropic Claude Opus 4.5' },
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
  'gemini-3-pro-preview': 'google',
  'claude-haiku-4-5': 'anthropic',
  'claude-sonnet-4-5': 'anthropic',
  'claude-opus-4-5': 'anthropic',
} as const;

/**
 * Users without the ai-grading-model-selection feature flag enabled must use the default model.
 */
export const DEFAULT_AI_GRADING_MODEL = 'gpt-5-mini-2025-08-07' as const;
