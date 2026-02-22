export const AI_GRADING_PROVIDERS = ['OpenAI', 'Google', 'Anthropic'] as const;
export type AiGradingProvider = (typeof AI_GRADING_PROVIDERS)[number];

export interface AiGradingApiKeyCredential {
  id: string;
  provider: AiGradingProvider;
  apiKeyMasked: string;
  dateAdded: string;
}
