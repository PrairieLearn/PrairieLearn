import type OpenAI from 'openai';

import { config } from './config.js';

/**
 * Compute the cost of an OpenAI response, in US dollars.
 */
export function calculateResponseCost(usage?: OpenAI.Responses.ResponseUsage): number {
  if (!usage) return 0;

  const cached_input_tokens = usage.input_tokens_details.cached_tokens;
  const prompt_tokens = usage.input_tokens - cached_input_tokens;
  const completion_tokens = usage.output_tokens;

  const cached_input_cost = config.costPerMillionCachedTokens / 10 ** 6;
  const prompt_cost = config.costPerMillionPromptTokens / 10 ** 6;
  const completion_cost = config.costPerMillionCompletionTokens / 10 ** 6;

  return (
    cached_input_tokens * cached_input_cost +
    prompt_tokens * prompt_cost +
    completion_tokens * completion_cost
  );
}
