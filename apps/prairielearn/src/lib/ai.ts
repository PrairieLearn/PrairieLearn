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
export function calculateResponseCost({
  model,
  usage,
}: {
  model: keyof (typeof config)['costPerMillionTokens'];
  usage?: OpenAI.Responses.ResponseUsage;
}): number {
  if (!usage) return 0;

  const modelPricing = config.costPerMillionTokens[model];

  const cachedInputTokens = usage.input_tokens_details.cached_tokens;
  const inputTokens = usage.input_tokens - cachedInputTokens;
  const outputTokens = usage.output_tokens;

  const cachedInputTokenCost = modelPricing.cachedInput / 10 ** 6;
  const inputTokenCost = modelPricing.input / 10 ** 6;
  const outputTokenCost = modelPricing.output / 10 ** 6;

  const cachedInputCost = cachedInputTokens * cachedInputTokenCost;
  const inputCost = inputTokens * inputTokenCost;
  const outputCost = outputTokens * outputTokenCost;

  return cachedInputCost + inputCost + outputCost;
}

export function emptyUsage(): OpenAI.Responses.ResponseUsage {
  return {
    input_tokens: 0,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 0,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 0,
  };
}

export function mergeUsage(
  a: OpenAI.Responses.ResponseUsage | undefined,
  b: OpenAI.Responses.ResponseUsage | undefined,
): OpenAI.Responses.ResponseUsage {
  return {
    input_tokens: (a?.input_tokens ?? 0) + (b?.input_tokens ?? 0),
    input_tokens_details: {
      cached_tokens:
        (a?.input_tokens_details.cached_tokens ?? 0) + (b?.input_tokens_details.cached_tokens ?? 0),
    },
    output_tokens: (a?.output_tokens ?? 0) + (b?.output_tokens ?? 0),
    output_tokens_details: {
      reasoning_tokens:
        (a?.output_tokens_details.reasoning_tokens ?? 0) +
        (b?.output_tokens_details.reasoning_tokens ?? 0),
    },
    total_tokens: (a?.total_tokens ?? 0) + (b?.total_tokens ?? 0),
  };
}
