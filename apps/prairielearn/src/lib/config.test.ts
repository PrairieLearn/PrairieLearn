import { expect, it } from 'vitest';

import { ConfigSchema } from './config.js';

it('keeps Vercel credentials optional until the course agent is used', () => {
  expect(ConfigSchema.shape.courseAgentVercel.parse(undefined)).toMatchObject({
    token: null,
    teamId: null,
    projectId: null,
    model: 'gpt-5.4',
    timeoutMs: 1_800_000,
  });
});
