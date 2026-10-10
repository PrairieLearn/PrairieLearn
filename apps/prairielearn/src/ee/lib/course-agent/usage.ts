import type { ChatSnapshot } from '@prairielearn/course-agent-contract';

import { config } from '../../../lib/config.js';

export function modelPricing(model: string) {
  const prices: Partial<Record<string, (typeof config.costPerMillionTokens)['gpt-6-astra']>> =
    config.costPerMillionTokens;
  return prices[model];
}
export function estimatedCost(
  usage: ChatSnapshot['conversationUsage'],
  price: ReturnType<typeof modelPricing> | null,
) {
  price = usage?.prices ?? price;
  if (!usage || !price) return null;
  return (
    ((usage.input - usage.cached - usage.cacheWrite) * price.input +
      usage.cached * price.cachedInput +
      usage.cacheWrite * price.cacheWrite +
      usage.output * price.output) /
    1_000_000
  );
}
