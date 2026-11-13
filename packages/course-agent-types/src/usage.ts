import { z } from 'zod';

const Count = z.number().int().min(0);

/**
 * Provider usage; PrairieLearn prices it. Cached reads and cache writes are both part of
 * `inputTokens`, and reasoning tokens are part of `outputTokens`.
 */
export const UsageSchema = z
  .strictObject({
    inputTokens: Count,
    cachedInputTokens: Count,
    cacheWriteInputTokens: Count,
    outputTokens: Count,
    reasoningTokens: Count,
    webSearchCalls: Count,
  })
  .refine(
    (usage) =>
      usage.cachedInputTokens + usage.cacheWriteInputTokens <= usage.inputTokens &&
      usage.reasoningTokens <= usage.outputTokens,
  );
export type Usage = z.infer<typeof UsageSchema>;

/**
 * The usage since the previous report, answered with PrairieLearn's decision on further model
 * requests. A retry resends the same report ID, so the usage is recorded once.
 */
export const UsageReportSchema = z.strictObject({
  reportId: z.uuid(),
  model: z.string().min(1),
  usage: UsageSchema,
});
export type UsageReport = z.infer<typeof UsageReportSchema>;

export const UsageDecisionSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('allowed') }),
  z.strictObject({ status: z.literal('limited'), retryAt: z.iso.datetime() }),
]);
export type UsageDecision = z.infer<typeof UsageDecisionSchema>;

export function emptyUsage(): Usage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    webSearchCalls: 0,
  };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheWriteInputTokens: a.cacheWriteInputTokens + b.cacheWriteInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    webSearchCalls: a.webSearchCalls + b.webSearchCalls,
  };
}

export function isEmptyUsage(usage: Usage) {
  return usage.inputTokens === 0 && usage.outputTokens === 0 && usage.webSearchCalls === 0;
}
