import { describe, expect, it } from 'vitest';

import {
  COURSE_AGENT_SEED_FILE,
  CourseAgentSnapshotSchema,
  courseAgentSandboxId,
} from './index.js';

describe('course-agent protocol', () => {
  it('derives a stable sandbox ID and seed path', () => {
    const conversationId = '9a6d8f44-d55b-4e73-8b9b-547dd00fb400';
    expect(courseAgentSandboxId(conversationId)).toBe(`course-agent-${conversationId}`);
    expect(COURSE_AGENT_SEED_FILE).toBe('/workspace/README.md');
  });

  it('validates an ephemeral runtime snapshot', () => {
    expect(
      CourseAgentSnapshotSchema.parse({
        conversationId: '9a6d8f44-d55b-4e73-8b9b-547dd00fb400',
        sandboxId: 'course-agent-test',
        activeRunId: null,
        status: 'waiting_for_user',
        response: 'Done',
        error: null,
        events: [],
        usage: {
          provider: 'fake',
          model: 'fake',
          inputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 1,
          reasoningTokens: null,
          normalizedTotalTokens: 2,
          providerCostMilliDollars: null,
          estimatedCostMilliDollars: 1,
          finalizedAt: '2026-09-01T00:00:00.000Z',
        },
      }).status,
    ).toBe('waiting_for_user');
  });
});
