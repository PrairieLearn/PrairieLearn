import { createHmac } from 'node:crypto';

import { afterEach, expect, it, vi } from 'vitest';

import { generateConversationTitle } from './conversation-title.js';

const env = { COURSE_AGENT_CAPABILITY_SECRET: 'test-secret', OPENAI_API_KEY: 'fake-test-key' };

function request(overrides = {}) {
  const data = Buffer.from(
    JSON.stringify({
      type: 'course-agent-title',
      conversationId: '11111111-1111-4111-8111-111111111111',
      userId: '1',
      courseId: '2',
      prompt: 'Create a numerical methods assessment',
      response: 'Created three questions.',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      ...overrides,
    }),
  ).toString('base64url');
  const date = Date.now().toString(36);
  const signature = Buffer.from(
    createHmac('sha256', env.COURSE_AGENT_CAPABILITY_SECRET)
      .update(`${date}.${data}`)
      .digest('hex'),
  ).toString('base64url');
  return new Request('https://worker.test/v1/title', {
    method: 'POST',
    body: JSON.stringify({ capability: `${signature}.${date}.${data}` }),
  });
}
afterEach(() => vi.unstubAllGlobals());

it('generates a bounded title without a sandbox, tools, or provider storage', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      output: [{ content: [{ type: 'output_text', text: '“Numerical methods assessment”' }] }],
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const response = await generateConversationTitle(
    request({ prompt: 'Créer un examen — méthodes numériques' }),
    env,
  );
  expect(await response.json()).toEqual({ title: 'Numerical methods assessment' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body).toMatchObject({ model: 'gpt-4.1-nano', store: false, max_output_tokens: 64 });
  expect(body).not.toHaveProperty('tools');
  expect(JSON.parse(body.input).user).toBe('Créer un examen — méthodes numériques');
});

it('rejects expired, incorrect-purpose, or unsigned capabilities before any model request', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    generateConversationTitle(request({ expiresAt: '2020-01-01T00:00:00.000Z' }), env),
  ).rejects.toThrow('expired');
  await expect(
    generateConversationTitle(request({ type: 'course-agent-inspect' }), env),
  ).rejects.toThrow();
  await expect(
    generateConversationTitle(request(), {
      ...env,
      COURSE_AGENT_CAPABILITY_SECRET: 'wrong-secret',
    }),
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rejects failed or empty model output so PL retains its fallback', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ output: [] }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(generateConversationTitle(request(), env)).rejects.toThrow('429');
  await expect(generateConversationTitle(request(), env)).rejects.toThrow();
});
