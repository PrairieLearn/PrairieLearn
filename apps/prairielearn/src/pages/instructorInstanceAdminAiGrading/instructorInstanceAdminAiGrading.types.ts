export { AI_GRADING_PROVIDER_OPTIONS } from '../../ee/lib/ai-grading/ai-grading-models.shared.js';

export interface AiGradingApiKeyCredential {
  id: string;
  provider: string;
  providerValue: string;
  apiKeyMasked: string;
  dateAdded: string;
}
