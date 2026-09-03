import { describe, expect, it } from 'vitest';

import { emptyUsage, finalizeUsage, updateUsageFromEvent } from './usage.js';

const rates = { input: 3000, cacheRead: 300, cacheWrite: 3750, output: 15_000, reasoning: 15_000 };

describe('course-agent usage normalization', () => {
  it('uses cumulative maxima so duplicate and older events do not double count', () => {
    const event = {
      usage: {
        input_tokens: 100,
        cached_input_tokens: 20,
        output_tokens: 30,
        output_tokens_details: { reasoning_tokens: 5 },
      },
    };
    const once = updateUsageFromEvent(emptyUsage('gpt-5.4-mini'), event, rates);
    const duplicate = updateUsageFromEvent(once, event, rates);
    const older = updateUsageFromEvent(duplicate, { usage: { output_tokens: 2 } }, rates);
    expect(older).toEqual(once);
    expect(once.normalizedTotalTokens).toBe(130);
    expect(once.inputTokens).toBe(80);
    expect(once.cacheReadTokens).toBe(20);
    expect(once.outputTokens).toBe(25);
    expect(once.reasoningTokens).toBe(5);
    expect(once.providerCostMilliDollars).toBeNull();
    expect(once.estimatedCostMilliDollars).toBe(1);
  });

  it('finalizes zero usage when a run ends before provider usage arrives', () => {
    expect(finalizeUsage(emptyUsage('gpt-5.4-mini'), '2026-09-01T00:00:00.000Z').finalizedAt).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });
});
