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
      id: 'resp_test',
      created_at: 1789012800,
      model: 'gpt-5.6-luna',
      output: [
        {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: '“Numerical methods assessment”', annotations: [] },
          ],
        },
      ],
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
  expect(body).toMatchObject({
    model: 'gpt-5.6-luna',
    store: false,
    max_output_tokens: 64,
    reasoning: { effort: 'none' },
  });
  expect(body).not.toHaveProperty('tools');
  const userMessage = body.input.find((message: { role: string }) => message.role === 'user');
  expect(JSON.parse(userMessage.content[0].text).user).toBe(
    'Créer un examen — méthodes numériques',
  );
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
    .mockResolvedValueOnce(Response.json({ error: { message: 'Rate limited' } }, { status: 429 }))
    .mockResolvedValueOnce(
      Response.json({
        id: 'resp_empty',
        created_at: 1789012800,
        model: 'gpt-5.6-luna',
        output: [],
      }),
    );
  vi.stubGlobal('fetch', fetchMock);
  await expect(generateConversationTitle(request(), env)).rejects.toThrow('Rate limited');
  await expect(generateConversationTitle(request(), env)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
