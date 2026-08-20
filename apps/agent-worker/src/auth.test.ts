import { SignJWT } from 'jose';
import { assert, describe, expect, it } from 'vitest';

import { assertStartCapability, parsePublicationCapability, verifyCapability } from './auth.js';

const secret = 'test-agent-capability-secret-at-least-32-bytes';

describe('run capabilities', () => {
  it('verifies HS256 claims and binds them to the start body', async () => {
    const token = await signCapability();
    const capability = await verifyCapability(
      new Request('https://worker.test/v1/runs/start', {
        headers: { authorization: `Bearer ${token}` },
      }),
      secret,
    );

    await assertStartCapability(capability, {
      conversation_id: 'conversation-1',
      run_id: 'run-1',
      course_id: '1',
      prompt: 'Create a question',
      prairielearn_base_url: 'https://prairielearn.test',
      harness: 'deterministic',
    });
  });

  it('rejects a mismatched run', async () => {
    const token = await signCapability();
    const capability = await verifyCapability(
      new Request('https://worker.test', {
        headers: { authorization: `Bearer ${token}` },
      }),
      secret,
    );

    await expect(
      assertStartCapability(capability, {
        conversation_id: 'conversation-1',
        run_id: 'run-2',
        course_id: '1',
        prompt: 'Create a question',
        prairielearn_base_url: 'https://prairielearn.test',
        harness: 'deterministic',
      }),
    ).rejects.toThrow();
  });

  it('parses exact publication authorization', async () => {
    const token = await signCapability({
      purpose: 'publish',
      operation_id: 'publish-1',
      target: {
        https_url: 'https://github.com/PrairieLearn/course.git',
        branch: 'pl-agent/course/run-1',
        head_sha: 'a'.repeat(40),
      },
    });
    const capability = await verifyCapability(
      new Request('https://worker.test', {
        headers: { authorization: `Bearer ${token}` },
      }),
      secret,
    );

    assert.deepEqual(parsePublicationCapability(capability.payload), {
      iss: 'prairielearn',
      aud: ['prairielearn-agent-worker', 'prairielearn-agent-api'],
      sub: '7',
      iat: capability.claims.iat,
      exp: capability.claims.exp,
      jti: 'token-1',
      run_id: 'run-1',
      conversation_id: 'conversation-1',
      course_id: '1',
      authn_user_id: '7',
      user_id: '7',
      allowed_tools: ['list_entities'],
      prompt_sha256: 'd8c0e4503fc49e6698f19e327fd77a3aa9456c9a69243b90cdbc0c563ac7249d',
      prairielearn_base_url: 'https://prairielearn.test',
      harness: 'deterministic',
      purpose: 'publish',
      operation_id: 'publish-1',
      target: {
        https_url: 'https://github.com/PrairieLearn/course.git',
        branch: 'pl-agent/course/run-1',
        head_sha: 'a'.repeat(40),
      },
    });
  });
});

async function signCapability(extra: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    sub: '7',
    jti: 'token-1',
    run_id: 'run-1',
    conversation_id: 'conversation-1',
    course_id: '1',
    authn_user_id: '7',
    user_id: '7',
    allowed_tools: ['list_entities'],
    prairielearn_base_url: 'https://prairielearn.test',
    harness: 'deterministic',
    purpose: 'run',
    prompt_sha256: 'd8c0e4503fc49e6698f19e327fd77a3aa9456c9a69243b90cdbc0c563ac7249d',
    ...extra,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('prairielearn')
    .setAudience(['prairielearn-agent-worker', 'prairielearn-agent-api'])
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(secret));
}
