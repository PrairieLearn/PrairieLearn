import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  CourseAgentCapability,
  CourseAgentStartRunRequest,
} from '@prairielearn/course-agent-protocol';
import { generateSignedToken } from '@prairielearn/signed-token';

import {
  authorizeRun,
  decodeAndVerifyToken,
  githubRepositoryUrl,
  publicGithubRepositoryUrl,
} from './auth.js';

const secret = 'course-agent-test-secret';

function makeRequest(): CourseAgentStartRunRequest {
  const prompt = 'Add a hint to question one';
  const capability: CourseAgentCapability = {
    type: 'course-agent-run',
    userId: '1',
    courseId: '2',
    conversationId: '3',
    runId: '4',
    sandboxId: 'sandbox-5',
    promptDigest: createHash('sha256').update(prompt).digest('hex'),
    repository: 'git@github.com:PrairieLearn/test-course.git',
    branch: 'master',
    callbackOrigin: 'http://127.0.0.1:3000',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  return {
    capability: generateSignedToken(capability, secret),
    conversationId: capability.conversationId,
    runId: capability.runId,
    sandboxId: capability.sandboxId,
    prompt,
    course: {
      id: capability.courseId,
      directory: 'test-course',
      repository: capability.repository,
      branch: capability.branch,
      expectedSha: null,
    },
    callbackOrigin: capability.callbackOrigin,
    localDevelopment: true,
    workspaceBackup: null,
  };
}

describe('course-agent Worker authorization', () => {
  it('verifies PrairieLearn signed tokens and every run-bound field', async () => {
    const request = makeRequest();
    await expect(authorizeRun(request, secret)).resolves.toBeUndefined();
    await expect(
      authorizeRun({ ...request, prompt: 'A different prompt' }, secret),
    ).rejects.toThrow('does not authorize');
    await expect(decodeAndVerifyToken(`${request.capability}x`, secret)).resolves.toBeNull();
  });

  it('normalizes supported GitHub repository forms and rejects other hosts', () => {
    expect(githubRepositoryUrl('git@github.com:PrairieLearn/test-course.git')).toBe(
      'https://x-access-token:proxy-injected@github.com/PrairieLearn/test-course.git',
    );
    expect(publicGithubRepositoryUrl('https://github.com/PrairieLearn/test-course')).toBe(
      'https://github.com/PrairieLearn/test-course.git',
    );
    expect(() => githubRepositoryUrl('https://gitlab.com/PrairieLearn/test-course')).toThrow(
      'github.com',
    );
  });
});
