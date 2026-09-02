import type { CourseAgentUsage } from '@prairielearn/course-agent-protocol';

export interface UsageRates {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
}

export function emptyUsage(model: string): CourseAgentUsage {
  return {
    provider: 'anthropic',
    model,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: null,
    normalizedTotalTokens: 0,
    providerCostMilliDollars: null,
    estimatedCostMilliDollars: 0,
    finalizedAt: null,
  };
}

function nonnegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function updateUsageFromEvent(
  current: CourseAgentUsage,
  event: Record<string, unknown>,
  rates: UsageRates,
): CourseAgentUsage {
  const message =
    typeof event.message === 'object' && event.message !== null
      ? (event.message as Record<string, unknown>)
      : {};
  const raw =
    typeof event.usage === 'object' && event.usage !== null
      ? (event.usage as Record<string, unknown>)
      : typeof message.usage === 'object' && message.usage !== null
        ? (message.usage as Record<string, unknown>)
        : {};
  const reasoning = Math.max(
    current.reasoningTokens ?? 0,
    nonnegativeInteger(raw.reasoning_tokens),
  );
  const next = {
    ...current,
    inputTokens: Math.max(current.inputTokens, nonnegativeInteger(raw.input_tokens)),
    cacheReadTokens: Math.max(
      current.cacheReadTokens,
      nonnegativeInteger(raw.cache_read_input_tokens),
    ),
    cacheWriteTokens: Math.max(
      current.cacheWriteTokens,
      nonnegativeInteger(raw.cache_creation_input_tokens),
    ),
    outputTokens: Math.max(current.outputTokens, nonnegativeInteger(raw.output_tokens)),
    reasoningTokens: reasoning > 0 ? reasoning : current.reasoningTokens,
    providerCostMilliDollars:
      typeof event.total_cost_usd === 'number' && event.total_cost_usd >= 0
        ? Math.max(current.providerCostMilliDollars ?? 0, Math.ceil(event.total_cost_usd * 1000))
        : current.providerCostMilliDollars,
  };
  next.normalizedTotalTokens =
    next.inputTokens +
    next.cacheReadTokens +
    next.cacheWriteTokens +
    next.outputTokens +
    (next.reasoningTokens ?? 0);
  next.estimatedCostMilliDollars = Math.ceil(
    (next.inputTokens * rates.input +
      next.cacheReadTokens * rates.cacheRead +
      next.cacheWriteTokens * rates.cacheWrite +
      next.outputTokens * rates.output +
      (next.reasoningTokens ?? 0) * rates.reasoning) /
      1_000_000,
  );
  return next;
}

export function finalizeUsage(usage: CourseAgentUsage, finalizedAt = new Date().toISOString()) {
  return { ...usage, finalizedAt };
}
