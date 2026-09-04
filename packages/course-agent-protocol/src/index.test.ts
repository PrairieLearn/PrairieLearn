import { describe, expect, it } from 'vitest';

import {
  COURSE_AGENT_SEED_FILE,
  CourseAgentRuntimeSettingsSchema,
  CourseAgentSnapshotSchema,
  CourseAgentStartRunRequestSchema,
  courseAgentSandboxId,
} from './index.js';

describe('course-agent protocol', () => {
  it('defaults the absolute lifetime to 600 seconds and permits short testing lifetimes', () => {
    const settings = { idleTimeoutSeconds: 600, turnTimeoutSeconds: 900 };
    expect(CourseAgentRuntimeSettingsSchema.parse(settings).maxLifetimeSeconds).toBe(600);
    expect(
      CourseAgentRuntimeSettingsSchema.parse({ ...settings, maxLifetimeSeconds: 5 })
        .maxLifetimeSeconds,
    ).toBe(5);
    expect(() =>
      CourseAgentRuntimeSettingsSchema.parse({ ...settings, maxLifetimeSeconds: 0 }),
    ).toThrow();
  });
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
      }).status,
    ).toBe('waiting_for_user');
  });

  it('validates a prompt without changing its signed wire value', () => {
    const prompt = '  Create a question  ';
    const request = CourseAgentStartRunRequestSchema.parse({
      capability: 'signed-capability',
      conversationId: '9a6d8f44-d55b-4e73-8b9b-547dd00fb400',
      runId: '40cff9bd-6931-4405-a8e6-57f93a190d4b',
      sandboxId: 'course-agent-test',
      prompt,
      course: {
        repository: 'PrairieLearn/PrairieLearn',
        branch: 'master',
        expectedSha: null,
      },
      runtimeSettings: { idleTimeoutSeconds: 600, turnTimeoutSeconds: 900 },
    });
    expect(request.prompt).toBe(prompt);
    expect(() => CourseAgentStartRunRequestSchema.parse({ ...request, prompt: '   ' })).toThrow();
  });
});
