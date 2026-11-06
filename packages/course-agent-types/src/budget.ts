import { z } from 'zod';

const Tokens = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Provider token counts; PrairieLearn prices them with its model price table. */
export const UsageTokensSchema = z
  .strictObject({
    inputTokens: Tokens,
    cachedInputTokens: Tokens,
    outputTokens: Tokens,
    reasoningTokens: Tokens,
  })
  .refine(
    (usage) =>
      usage.cachedInputTokens <= usage.inputTokens && usage.reasoningTokens <= usage.outputTokens,
  );
export type UsageTokens = z.infer<typeof UsageTokensSchema>;

/**
 * The usage since the previous report, answered with PrairieLearn's decision on further model
 * requests. A retry resends the same report ID, so the usage is recorded once.
 */
export const UsageReportSchema = z.strictObject({
  reportId: z.uuid(),
  model: z.string().min(1),
  usage: UsageTokensSchema,
});
export type UsageReport = z.infer<typeof UsageReportSchema>;

export const UsageDecisionSchema = z.union([
  z.strictObject({ status: z.literal('allowed') }),
  z.strictObject({
    status: z.literal('denied'),
    reason: z.literal('hourly_limit'),
    retryAt: z.iso.datetime(),
  }),
  z.strictObject({ status: z.literal('denied'), reason: z.literal('not_allowed') }),
]);
export type UsageDecision = z.infer<typeof UsageDecisionSchema>;

export function emptyUsage(): UsageTokens {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

export function addUsage(a: UsageTokens, b: UsageTokens): UsageTokens {
  return UsageTokensSchema.parse({
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  });
}
