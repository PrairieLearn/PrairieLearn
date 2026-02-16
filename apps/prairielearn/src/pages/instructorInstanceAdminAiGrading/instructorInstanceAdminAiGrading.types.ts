export const AI_GRADING_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'anthropic', label: 'Anthropic' },
] as const;

export interface AiGradingApiKeyCredential {
  id: string;
  provider: string;
  providerValue: string;
  apiKeyMasked: string;
  dateAdded: string;
}
