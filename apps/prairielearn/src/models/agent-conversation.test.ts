import { describe, expect, it } from 'vitest';

import { isAgentRunStatusTransitionAllowed } from './agent-conversation.js';

describe('agent run status transitions', () => {
  it.each([
    ['pending', 'running'],
    ['pending', 'failed'],
    ['pending', 'canceled'],
    ['running', 'completed'],
    ['running', 'failed'],
    ['running', 'canceled'],
    ['stopping', 'completed'],
    ['stopping', 'failed'],
    ['stopping', 'canceled'],
    ['completed', 'completed'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(isAgentRunStatusTransitionAllowed(from, to)).toBe(true);
  });

  it.each([
    ['pending', 'completed'],
    ['running', 'pending'],
    ['completed', 'running'],
    ['failed', 'running'],
    ['canceled', 'running'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(isAgentRunStatusTransitionAllowed(from, to)).toBe(false);
  });
});
