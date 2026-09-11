import { type OpenAIProviderSettings, createOpenAI } from '@ai-sdk/openai';

import { withOpenAiHighPdfDetail } from './openai-pdf-detail.js';

export function createAiGradingOpenAI(options: OpenAIProviderSettings) {
  return createOpenAI({
    ...options,
    fetch: withOpenAiHighPdfDetail(options.fetch ?? fetch),
  });
}
