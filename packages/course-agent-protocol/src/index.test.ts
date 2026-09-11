import { describe, expect, it } from 'vitest';

import {
  COURSE_AGENT_SEED_FILE,
  CourseAgentRuntimeSettingsSchema,
  CourseAgentSnapshotSchema,
  CourseAgentStartRunRequestSchema,
  courseAgentSandboxId,
} from './index.js';

describe('course-agent protocol', () => {
  it('prefers canonical timeout settings over legacy aliases and drops the execution cap', () => {
    expect(
      CourseAgentRuntimeSettingsSchema.parse({
        idleTimeoutSeconds: 60,
        waitingForUserTimeoutSeconds: 120,
        sleepAfterSeconds: 60,
        cloudflareSandboxTimeoutSeconds: 21600,
        turnTimeoutSeconds: 600,
      }),
    ).toMatchObject({
      idleTimeoutSeconds: 120,
      waitingForUserTimeoutSeconds: 120,
      sleepAfterSeconds: 21600,
      cloudflareSandboxTimeoutSeconds: 21600,
      sandboxInactivityTimeoutSeconds: 21600,
    });
    expect(CourseAgentRuntimeSettingsSchema.parse({ turnTimeoutSeconds: 600 })).not.toHaveProperty(
      'turnTimeoutSeconds',
    );
  });
  it('defaults the platform failsafe to six hours without an absolute sandbox lifetime', () => {
    const settings = { idleTimeoutSeconds: 600, turnTimeoutSeconds: 900 };
    expect(CourseAgentRuntimeSettingsSchema.parse(settings).sleepAfterSeconds).toBe(21_600);
    expect(
      CourseAgentRuntimeSettingsSchema.parse({ ...settings, sleepAfterSeconds: 60 })
        .sleepAfterSeconds,
    ).toBe(60);
    expect(() =>
      CourseAgentRuntimeSettingsSchema.parse({ ...settings, sleepAfterSeconds: 0 }),
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
      authoringContext: {
        courseInstance: { id: '91', shortName: 'Fa26', longName: 'Fall 2026' },
      },
      runtimeSettings: {
        idleTimeoutSeconds: 600,
        backupTtlSeconds: 604_800,
        turnTimeoutSeconds: 900,
      },
    });
    expect(request.prompt).toBe(prompt);
    expect(request.authoringContext.courseInstance?.shortName).toBe('Fa26');
    expect(() => CourseAgentStartRunRequestSchema.parse({ ...request, prompt: '   ' })).toThrow();
  });
});
