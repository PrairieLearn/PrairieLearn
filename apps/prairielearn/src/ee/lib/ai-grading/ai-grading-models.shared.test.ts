import { describe, expect, it } from 'vitest';

import {
  AI_GRADING_MODELS,
  DEFAULT_AI_GRADING_MODEL,
  computeAiGradingRelativeCosts,
} from './ai-grading-models.shared.js';

describe('computeAiGradingRelativeCosts', () => {
  it.each([
    { input: 0.1, output: 0.5, expected: '<0.1x' },
    { input: 0, output: 0, expected: '0x' },
    { input: 0.2, output: 1.2, expected: '0.1x' },
    { input: 2, output: 12, expected: '1x' },
  ])(
    'formats relative cost as $expected for $input input and $output output',
    ({ input, output, expected }) => {
      const pricing = Object.fromEntries(
        AI_GRADING_MODELS.map(({ modelId }) => [modelId, { input: 2, output: 12 }]),
      );
      pricing['gpt-6-luna'] = { input, output };

      const costs = computeAiGradingRelativeCosts(pricing);

      expect(costs['gpt-6-luna']).toBe(expected);
      expect(costs[DEFAULT_AI_GRADING_MODEL]).toBe('1x');
    },
  );
});
