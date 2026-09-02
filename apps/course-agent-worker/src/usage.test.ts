import { describe, expect, it } from 'vitest';

import { emptyUsage, finalizeUsage, updateUsageFromEvent } from './usage.js';

const rates = { input: 3000, cacheRead: 300, cacheWrite: 3750, output: 15_000, reasoning: 15_000 };

describe('course-agent usage normalization', () => {
  it('uses cumulative maxima so duplicate and older events do not double count', () => {
    const event = {
      usage: {
        input_tokens: 100,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 10,
        output_tokens: 30,
        reasoning_tokens: 5,
      },
      total_cost_usd: 0.002,
    };
    const once = updateUsageFromEvent(emptyUsage('sonnet'), event, rates);
    const duplicate = updateUsageFromEvent(once, event, rates);
    const older = updateUsageFromEvent(duplicate, { usage: { output_tokens: 2 } }, rates);
    expect(older).toEqual(once);
    expect(once.normalizedTotalTokens).toBe(165);
    expect(once.providerCostMilliDollars).toBe(2);
    expect(once.estimatedCostMilliDollars).toBe(1);
  });

  it('finalizes zero usage when a run ends before provider usage arrives', () => {
    expect(finalizeUsage(emptyUsage('sonnet'), '2026-09-01T00:00:00.000Z').finalizedAt).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });
});
