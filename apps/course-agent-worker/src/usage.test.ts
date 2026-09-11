import { expect, it, vi } from 'vitest';

import { decodeAndVerifyToken } from './auth.js';
import { meteredOpenAiRequest, normalizeProviderUsage, signUsageToken } from './usage.js';

const env = {
  COURSE_AGENT_CAPABILITY_SECRET: 'test-secret',
  COURSE_AGENT_PL_ORIGIN: 'https://pl.test',
  OPENAI_API_KEY: 'test-key',
};
const identity = {
  runId: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  courseId: '1',
  userId: '2',
};
const usage = {
  input_tokens: 100,
  input_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 },
  output_tokens: 20,
  output_tokens_details: { reasoning_tokens: 15 },
};

function request(path = '/v1/responses') {
  return new Request(`https://api.openai.com${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer proxy-injected' },
    body: JSON.stringify({ model: 'gpt-6-astra' }),
  });
}

it('normalizes subsets without double counting and rejects invalid counts', () => {
  expect(normalizeProviderUsage(usage)).toEqual({
    input_tokens: 100,
    cache_read_tokens: 60,
    cache_write_tokens: 10,
    output_tokens: 20,
    reasoning_tokens: 15,
  });
  expect(() => normalizeProviderUsage({ ...usage, input_tokens: -1 })).toThrow();
  expect(() => normalizeProviderUsage({ ...usage, output_tokens: 1 })).toThrow();
  expect(() => normalizeProviderUsage({})).toThrow();
});

it('signs callbacks with the existing capability format', async () => {
  const token = await signUsageToken(
    { type: 'course-agent-usage', ...identity },
    env.COURSE_AGENT_CAPABILITY_SECRET,
  );
  expect(await decodeAndVerifyToken(token, env.COURSE_AGENT_CAPABILITY_SECRET)).toEqual({
    type: 'course-agent-usage',
    ...identity,
  });
  expect(await decodeAndVerifyToken(token, 'wrong')).toBeNull();
});

it('does not contact the provider when PL denies or cannot check usage', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ allowed: false, message: 'Hourly limit reached' }, { status: 429 }),
    );
  expect((await meteredOpenAiRequest(request(), env, identity, fetchMock)).status).toBe(429);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockRejectedValue(new Error('offline'));
  expect((await meteredOpenAiRequest(request(), env, identity, fetchMock)).status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(['/v1/responses', '/v1/responses/compact'])(
  'records a non-streamed response at %s',
  async (path) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ allowed: true }))
      .mockResolvedValueOnce(Response.json({ usage }))
      .mockResolvedValueOnce(Response.json({ allowed: true }));
    await meteredOpenAiRequest(request(path), env, identity, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const body = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(
      await decodeAndVerifyToken(body.token, env.COURSE_AGENT_CAPABILITY_SECRET),
    ).toMatchObject({ ...identity, action: 'record', usage: normalizeProviderUsage(usage) });
  },
);

it('preserves split SSE bytes and saves the terminal usage only once', async () => {
  const event = `data: ${JSON.stringify({ type: 'response.completed', response: { usage } })}\r\n\r\n`;
  const bytes = new TextEncoder().encode(event + event);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 13));
      controller.enqueue(bytes.slice(13));
      controller.close();
    },
  });
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ allowed: true }))
    .mockResolvedValueOnce(
      new Response(source, { headers: { 'content-type': 'text/event-stream' } }),
    )
    .mockResolvedValueOnce(Response.json({ allowed: true }));
  const result = await meteredOpenAiRequest(request(), env, identity, fetchMock);
  expect(await result.text()).toBe(event + event);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('retries accounting with the same receipt, never the paid request', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ allowed: true }))
    .mockResolvedValueOnce(Response.json({ usage }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ allowed: true }));
  await meteredOpenAiRequest(request(), env, identity, fetchMock);
  const callbacks = await Promise.all(
    fetchMock.mock.calls
      .filter((call) => call[1]?.body)
      .map(async (call) =>
        decodeAndVerifyToken(
          JSON.parse(String(call[1]?.body)).token,
          env.COURSE_AGENT_CAPABILITY_SECRET,
        ),
      ),
  );
  expect(callbacks).toHaveLength(3);
  expect(new Set(callbacks.map((value) => (value as { id: string }).id)).size).toBe(1);
});

it('does not invent usage for a truncated response', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ allowed: true }))
    .mockResolvedValueOnce(
      new Response('data: {"type":"response.created"}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
  const result = await meteredOpenAiRequest(request(), env, identity, fetchMock);
  await result.text();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('fails closed on an unexpected successful response from the PL origin', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>Sign in</html>'));
  expect((await meteredOpenAiRequest(request(), env, identity, fetchMock)).status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
