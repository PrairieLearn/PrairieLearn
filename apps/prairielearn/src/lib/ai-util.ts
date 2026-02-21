import { type OpenAIProvider } from '@ai-sdk/openai';
import type { GenerateObjectResult, GenerateTextResult, LanguageModelUsage } from 'ai';

import type { CounterClockwiseRotationDegrees } from '../ee/lib/ai-grading/types.js';

import { config } from './config.js';

export type OpenAIModelId = Parameters<OpenAIProvider['languageModel']>[0];

type Prompt = (string | string[])[];

/**
 * AI image grading response and, if rotation correction occurred, associated rotation correction responses.
 */
export type AiImageGradingResponses =
  | {
      rotationCorrectionApplied: false;
      finalGradingResponse: GenerateObjectResult<any>;
    }
  | {
      rotationCorrectionApplied: true;
      finalGradingResponse: GenerateObjectResult<any>;
      rotationCorrections: Record<
        string,
        {
          degreesRotated: CounterClockwiseRotationDegrees;
          response: GenerateObjectResult<any>;
        }
      >;
      gradingResponseWithRotationIssue: GenerateObjectResult<any>;
    };

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
  logger.info(`  Cache read tokens: ${usage.inputTokenDetails.cacheReadTokens ?? 0}`);
  logger.info(`  Cache write tokens: ${usage.inputTokenDetails.cacheWriteTokens ?? 0}`);
  logger.info(`Output tokens: ${usage.outputTokens ?? 0}`);
  logger.info(`  Reasoning tokens: ${usage.outputTokenDetails.reasoningTokens ?? 0}`);
}

/**
 * Log the total token usage for a list of LLM responses.
 */
export function logResponsesUsage({
  responses,
  logger,
}: {
  responses: (GenerateObjectResult<any> | GenerateTextResult<any, any>)[];
  logger: { info: (msg: string) => void };
}) {
  const { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens } =
    responses.reduce(
      (acc, response) => {
        const usage = response.usage;
        acc.inputTokens += usage.inputTokens ?? 0;
        acc.cachedInputTokens += usage.cachedInputTokens ?? 0;
        acc.outputTokens += usage.outputTokens ?? 0;
        acc.reasoningTokens += usage.reasoningTokens ?? 0;
        acc.totalTokens += usage.totalTokens ?? 0;
        return acc;
      },
      {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      },
    );

  logger.info(`Input tokens: ${inputTokens}`);
  logger.info(`  Cached input tokens: ${cachedInputTokens}`);
  logger.info(`Output tokens: ${outputTokens}`);
  logger.info(`  Reasoning tokens: ${reasoningTokens}`);
  logger.info(`Total tokens: ${totalTokens}`);
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

  const inputTokens = usage.inputTokenDetails.noCacheTokens ?? 0;
  const cacheReadTokens = usage.inputTokenDetails.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  // The prices are per million tokens, so divide by 1e6.
  const inputCost = inputTokens * (modelPricing.input / 1e6);
  const cacheReadCost = cacheReadTokens * (modelPricing.cachedInput / 1e6);
  const cacheWriteCost = cacheWriteTokens * (modelPricing.cacheWrite / 1e6);
  const outputCost = outputTokens * (modelPricing.output / 1e6);

  return inputCost + cacheReadCost + cacheWriteCost + outputCost;
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

/** @knipignore */
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
