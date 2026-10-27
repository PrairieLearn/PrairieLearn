import { z } from 'zod';

const Amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Sequence = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const UsageDeltaSchema = z
  .strictObject({
    inputTokens: Amount,
    cachedInputTokens: Amount,
    outputTokens: Amount,
    reasoningTokens: Amount,
    costMilliDollars: Amount,
  })
  .refine(
    (usage) =>
      usage.cachedInputTokens <= usage.inputTokens && usage.reasoningTokens <= usage.outputTokens,
  );
export type UsageDelta = z.infer<typeof UsageDeltaSchema>;
export const BudgetRequestSchema = z.strictObject({
  sequence: Sequence,
  usageDelta: UsageDeltaSchema,
  requestCredit: z.boolean(),
});
export type BudgetRequest = z.infer<typeof BudgetRequestSchema>;
const WindowSchema = z.strictObject({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() });
export const BudgetResponseSchema = z.strictObject({
  sequence: Sequence,
  allocation: z.union([
    z.strictObject({ status: z.literal('not_requested') }),
    z.strictObject({
      status: z.literal('granted'),
      grantedMilliDollars: Amount.positive(),
      window: WindowSchema,
    }),
    z.strictObject({
      status: z.literal('denied'),
      reason: z.literal('hourly_limit'),
      retryAt: z.iso.datetime(),
      window: WindowSchema,
    }),
    z.strictObject({
      status: z.literal('denied'),
      reason: z.literal('not_allowed'),
      retryAt: z.null(),
    }),
  ]),
});
export type BudgetResponse = z.infer<typeof BudgetResponseSchema>;

export const BudgetErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      'invalid_request',
      'unauthorized',
      'not_found',
      'report_conflict',
      'unavailable',
    ]),
    message: z.string(),
  }),
});
export type BudgetError = z.infer<typeof BudgetErrorSchema>;

export function emptyUsage(): UsageDelta {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    costMilliDollars: 0,
  };
}

export function addUsage(a: UsageDelta, b: UsageDelta): UsageDelta {
  return UsageDeltaSchema.parse({
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    costMilliDollars: a.costMilliDollars + b.costMilliDollars,
  });
}
