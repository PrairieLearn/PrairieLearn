import { type OpenAIProvider } from '@ai-sdk/openai';
import type { GenerateObjectResult, GenerateTextResult, LanguageModelUsage } from 'ai';

import { config } from './config.js';

export type OpenAIModelId = Parameters<OpenAIProvider['languageModel']>[0];

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
  response: GenerateObjectResult<any> | GenerateTextResult<any, any>;
  logger: { info: (msg: string) => void };
}) {
  const usage = response.usage;
  logger.info(`Input tokens: ${usage.inputTokens ?? 0}`);
  logger.info(`  Cached input tokens: ${usage.cachedInputTokens ?? 0}`);
  logger.info(`Output tokens: ${usage.outputTokens ?? 0}`);
  logger.info(`  Reasoning tokens: ${usage.reasoningTokens ?? 0}`);
  logger.info(`Total tokens: ${usage.totalTokens ?? 0}`);
}

/**
 * Compute the cost of an OpenAI response, in US dollars.
 */
export function calculateResponseCost({
  model,
  usage,
}: {
  model: keyof (typeof config)['costPerMillionTokens'];
  usage?: LanguageModelUsage;
}): number {
  if (!usage) return 0;

  const modelPricing = config.costPerMillionTokens[model];

  // TODO: this doesn't take into account cache writes, which some providers
  // (e.g. Anthropic) charge for.
  const cachedInputTokens = usage.inputTokenDetails.cacheReadTokens ?? 0;
  const inputTokens = usage.inputTokenDetails.noCacheTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  const cachedInputTokenCost = modelPricing.cachedInput / 10 ** 6;
  const inputTokenCost = modelPricing.input / 10 ** 6;
  const outputTokenCost = modelPricing.output / 10 ** 6;

  const cachedInputCost = cachedInputTokens * cachedInputTokenCost;
  const inputCost = inputTokens * inputTokenCost;
  const outputCost = outputTokens * outputTokenCost;

  return cachedInputCost + inputCost + outputCost;
}

export function emptyUsage(): LanguageModelUsage {
  return {
    inputTokens: 0,
    inputTokenDetails: {
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokens: 0,
    outputTokenDetails: {
      textTokens: 0,
      reasoningTokens: 0,
    },
    totalTokens: 0,
  };
}

export function mergeUsage(
  a: LanguageModelUsage | undefined,
  b: LanguageModelUsage | undefined,
): LanguageModelUsage {
  return {
    inputTokens: (a?.inputTokens ?? 0) + (b?.inputTokens ?? 0),
    inputTokenDetails: {
      noCacheTokens:
        (a?.inputTokenDetails.noCacheTokens ?? 0) + (b?.inputTokenDetails.noCacheTokens ?? 0),
      cacheReadTokens:
        (a?.inputTokenDetails.cacheReadTokens ?? 0) + (b?.inputTokenDetails.cacheReadTokens ?? 0),
      cacheWriteTokens:
        (a?.inputTokenDetails.cacheWriteTokens ?? 0) + (b?.inputTokenDetails.cacheWriteTokens ?? 0),
    },
    outputTokens: (a?.outputTokens ?? 0) + (b?.outputTokens ?? 0),
    outputTokenDetails: {
      textTokens: (a?.outputTokenDetails.textTokens ?? 0) + (b?.outputTokenDetails.textTokens ?? 0),
      reasoningTokens:
        (a?.outputTokenDetails.reasoningTokens ?? 0) + (b?.outputTokenDetails.reasoningTokens ?? 0),
    },
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
  };
}
