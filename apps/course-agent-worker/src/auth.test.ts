import { describe, expect, it } from 'vitest';

import type {
  CourseAgentRunCapability,
  CourseAgentStartRunRequest,
} from '@prairielearn/course-agent-protocol';

import { authorizeRun, decodeAndVerifyToken } from './auth.js';

const secret = 'course-agent-test-secret';

async function sign(data: unknown) {
  const date = Date.now().toString(36);
  const encodedData = Buffer.from(JSON.stringify(data)).toString('base64url');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${date}.${encodedData}`)),
  );
  const hex = [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${Buffer.from(hex).toString('base64url')}.${date}.${encodedData}`;
}

async function makeRequest(): Promise<CourseAgentStartRunRequest> {
  const prompt = 'Read and update the seed file';
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prompt)),
  );
  const capability: CourseAgentRunCapability = {
    type: 'course-agent-run',
    userId: '1',
    courseId: '2',
    conversationId: '9a6d8f44-d55b-4e73-8b9b-547dd00fb400',
    runId: '5416e1c9-616a-45f7-b859-4e0b236ce290',
    sandboxId: 'course-agent-test',
    promptDigest: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    runtimeSettings: { idleTimeoutSeconds: 600, turnTimeoutSeconds: 900 },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    repository: 'https://github.com/PrairieLearn/test.git',
    branch: 'master',
    expectedSha: '0123456789abcdef0123456789abcdef01234567',
  };
  return {
    capability: await sign(capability),
    conversationId: capability.conversationId,
    runId: capability.runId,
    sandboxId: capability.sandboxId,
    prompt,
    course: {
      repository: capability.repository,
      branch: capability.branch,
      expectedSha: capability.expectedSha,
    },
    runtimeSettings: capability.runtimeSettings,
  };
}

describe('course-agent Worker authorization', () => {
  it('binds a signed request to its prompt and runtime identifiers', async () => {
    const request = await makeRequest();
    await expect(authorizeRun(request, secret)).resolves.toMatchObject({ userId: '1' });
    await expect(
      authorizeRun({ ...request, prompt: 'A different prompt' }, secret),
    ).rejects.toThrow('does not authorize');
    await expect(
      authorizeRun({ ...request, course: { ...request.course, expectedSha: null } }, secret),
    ).rejects.toThrow('does not authorize');
    await expect(
      authorizeRun(
        { ...request, runtimeSettings: { ...request.runtimeSettings, turnTimeoutSeconds: 1_200 } },
        secret,
      ),
    ).rejects.toThrow('does not authorize');
    await expect(decodeAndVerifyToken(`${request.capability}x`, secret)).resolves.toBeNull();
  });
});
