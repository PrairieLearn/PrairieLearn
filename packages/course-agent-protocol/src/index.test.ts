import { describe, expect, it } from 'vitest';

import {
  COURSE_AGENT_SEED_FILE,
  CourseAgentRuntimeSettingsSchema,
  CourseAgentSnapshotSchema,
  CourseAgentStartRunRequestSchema,
  courseAgentSandboxId,
} from './index.js';

describe('course-agent protocol', () => {
  it('bounds the saved-workspace lifetime', () => {
    expect(CourseAgentRuntimeSettingsSchema.parse({}).backupTtlSeconds).toBe(604_800);
    expect(() => CourseAgentRuntimeSettingsSchema.parse({ backupTtlSeconds: 0 })).toThrow();
    expect(() => CourseAgentRuntimeSettingsSchema.parse({ backupTtlSeconds: 2_592_001 })).toThrow();
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

  it('validates a prompt without changing its content', () => {
    const prompt = '  Create a question  ';
    const request = CourseAgentStartRunRequestSchema.parse({
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
        backupTtlSeconds: 604_800,
      },
    });
    expect(request.prompt).toBe(prompt);
    expect(request.authoringContext.courseInstance?.shortName).toBe('Fa26');
    expect(() => CourseAgentStartRunRequestSchema.parse({ ...request, prompt: '   ' })).toThrow();
  });
});
