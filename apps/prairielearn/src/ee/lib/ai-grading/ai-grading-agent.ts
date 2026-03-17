import assert from 'node:assert';

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import { config } from '../../../lib/config.js';

import type { AiGradingModelId } from './ai-grading-models.shared.js';

const AGENTIC_AI_GRADING_MODEL: AiGradingModelId = 'gpt-5-mini-2025-08-07';

export function getAgenticGradingModel(): { model: LanguageModel; modelId: string } {
  assert(config.aiGradingOpenAiApiKey, 'AI grading OpenAI API key is not configured');
  const openai = createOpenAI({
    apiKey: config.aiGradingOpenAiApiKey,
    organization: config.aiGradingOpenAiOrganization ?? undefined,
  });
  const modelId = AGENTIC_AI_GRADING_MODEL;
  return { model: openai(modelId), modelId };
}
