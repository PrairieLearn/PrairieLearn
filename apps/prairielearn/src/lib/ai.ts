import { config } from './config.js';

/**
 * Compute the cost of a completion, in US dollars.
 */
export function computeCompletionCost({
  promptTokens,
  completionTokens,
}: {
  promptTokens: number;
  completionTokens: number;
}) {
  return (
    (config.costPerMillionPromptTokens * promptTokens +
      config.costPerMillionCompletionTokens * completionTokens) /
    1e6
  );
}
