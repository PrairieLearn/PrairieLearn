import type OpenAI from 'openai';

import { config } from './config.js';

type Prompt = (string | string[])[];

/**
 * Utility function to format a prompt from an array of strings and/or string arrays.
 *
 * Entries in the top-level array are considered paragraphs and are joined with two newlines.
 * Entries in nested arrays are joined with a single space to form a single paragraph.
 */
export function formatPrompt(prompt: Prompt): string {
  const joinedParagraphs = prompt.map((part) => (Array.isArray(part) ? part.join(' ') : part));
  return joinedParagraphs.join('\n\n');
}

export function logResponseUsage({
  response,
  logger,
}: {
  response: OpenAI.Responses.Response;
  logger: { info: (msg: string) => void };
}) {
  const { usage } = response;
  logger.info(`Input tokens: ${usage?.input_tokens ?? 0}`);
  logger.info(`  Cached input tokens: ${usage?.input_tokens_details.cached_tokens ?? 0}`);
  logger.info(`Output tokens: ${usage?.output_tokens ?? 0}`);
  logger.info(`  Reasoning tokens: ${usage?.output_tokens_details.reasoning_tokens ?? 0}`);
  logger.info(`Total tokens: ${usage?.total_tokens ?? 0}`);
}

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
