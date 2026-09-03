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
    provider: 'openai',
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
  const raw =
    typeof event.usage === 'object' && event.usage !== null
      ? (event.usage as Record<string, unknown>)
      : {};
  const outputDetails =
    typeof raw.output_tokens_details === 'object' && raw.output_tokens_details !== null
      ? (raw.output_tokens_details as Record<string, unknown>)
      : {};
  const totalInput = nonnegativeInteger(raw.input_tokens);
  const cachedInput = Math.min(totalInput, nonnegativeInteger(raw.cached_input_tokens));
  const totalOutput = nonnegativeInteger(raw.output_tokens);
  const eventReasoning = Math.min(
    totalOutput,
    Math.max(
      nonnegativeInteger(raw.reasoning_tokens),
      nonnegativeInteger(outputDetails.reasoning_tokens),
    ),
  );
  const reasoning = Math.max(current.reasoningTokens ?? 0, eventReasoning);
  const next = {
    ...current,
    inputTokens: Math.max(current.inputTokens, totalInput - cachedInput),
    cacheReadTokens: Math.max(current.cacheReadTokens, cachedInput),
    outputTokens: Math.max(current.outputTokens, totalOutput - eventReasoning),
    reasoningTokens: reasoning > 0 ? reasoning : current.reasoningTokens,
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
