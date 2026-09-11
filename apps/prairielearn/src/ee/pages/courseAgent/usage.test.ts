import express from 'express';
import { beforeEach, expect, it, vi } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';
import { generateSignedToken } from '@prairielearn/signed-token';

import { withConfig } from '../../../tests/utils/config.js';
import { handleCourseAgentUsage } from '../../lib/course-agent/usage.js';

import router from './usage.js';

vi.mock('../../lib/course-agent/usage.js', () => ({ handleCourseAgentUsage: vi.fn() }));
const data = {
  type: 'course-agent-usage',
  action: 'authorize',
  id: '11111111-1111-4111-8111-111111111111',
  runId: '22222222-2222-4222-8222-222222222222',
  conversationId: '33333333-3333-4333-8333-333333333333',
  userId: '1',
  courseId: '2',
  model: 'gpt-6-astra',
  usage: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
};
beforeEach(() =>
  vi.mocked(handleCourseAgentUsage).mockReset().mockResolvedValue({ allowed: true, message: null }),
);

it('accepts signed callbacks and rejects tampering, wrong purposes, and expiration', async () => {
  const app = express().use(express.json()).use(router);
  await withConfig(
    { courseAgentRuntime: 'cloudflare', courseAgentCapabilitySecret: 'test-secret' },
    async () =>
      withServer(app, async ({ url }) => {
        const send = (token: string) =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
        expect((await send(generateSignedToken(data, 'test-secret'))).status).toBe(200);
        expect((await send(generateSignedToken(data, 'wrong'))).status).toBe(403);
        expect(
          (
            await send(
              generateSignedToken({ ...data, type: 'course-agent-inspect' }, 'test-secret'),
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await send(
              generateSignedToken(
                { ...data, expiresAt: '2020-01-01T00:00:00.000Z' },
                'test-secret',
              ),
            )
          ).status,
        ).toBe(403);
        expect(handleCourseAgentUsage).toHaveBeenCalledTimes(1);
        vi.mocked(handleCourseAgentUsage).mockResolvedValue({
          allowed: false,
          message: 'Hourly limit reached',
        });
        expect((await send(generateSignedToken(data, 'test-secret'))).status).toBe(429);
      }),
  );
});
