import type { ConversationUsage } from '@prairielearn/course-agent-contract';

import type { CodexState } from './codex.js';

/** Translate native thread totals into lifetime totals, including work lost after a checkpoint. */
export function accumulateUsage(
  current: ConversationUsage,
  baseline: CodexState['usageTotal'],
  total: NonNullable<CodexState['usageTotal']>,
): ConversationUsage | undefined {
  const before =
    baseline?.threadId === total.threadId
      ? baseline
      : { input: 0, cached: 0, cacheWrite: 0, output: 0 };
  if (
    total.input < before.input ||
    total.cached < before.cached ||
    total.output < before.output ||
    total.cacheWrite < before.cacheWrite
  ) {
    return;
  }
  return {
    model: current.model,
    version: current.version + 1,
    input: current.input === null ? null : current.input + total.input - before.input,
    cached: current.cached === null ? null : current.cached + total.cached - before.cached,
    cacheWrite:
      current.cacheWrite === null
        ? null
        : current.cacheWrite + total.cacheWrite - before.cacheWrite,
    output: current.output === null ? null : current.output + total.output - before.output,
  };
}
