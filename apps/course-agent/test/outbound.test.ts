import { expect, it } from 'vitest';

import { forwardGitHub, forwardOpenAI } from '../src/outbound.js';

it('binds Git credentials to the configured repository and strips sandbox headers', async () => {
  let captured: Request | undefined;
  const send: typeof fetch = async (request) => {
    captured = request as Request;
    return new Response('ok');
  };
  const response = await forwardGitHub(
    new Request('http://github.com/org/course.git/info/refs?service=git-upload-pack', {
      headers: { Authorization: 'attacker', 'X-Secret': 'private' },
    }),
    { repository: 'org/course', GITHUB_CLIENT_TOKEN: 'fake-shared-client-token' },
    send,
  );
  expect(response.status).toBe(200);
  expect(captured?.url).toBe('https://github.com/org/course.git/info/refs?service=git-upload-pack');
  expect(captured?.headers.get('X-Secret')).toBeNull();
  expect(captured?.headers.get('Authorization')).toBe(
    `Basic ${btoa('x-access-token:fake-shared-client-token')}`,
  );
});
it.each([
  'http://github.com/other/course.git/info/refs?service=git-upload-pack',
  'http://github.com/org/course.git/info/refs?service=git-receive-pack',
  'https://api.github.com/repos/org/course',
])('rejects unapproved outbound access %s', async (url) => {
  let called = false;
  const response = await forwardGitHub(
    new Request(url),
    { repository: 'org/course', GITHUB_CLIENT_TOKEN: 'fake-shared-client-token' },
    async () => {
      called = true;
      return new Response();
    },
  );
  expect(response.status).toBe(403);
  expect(called).toBe(false);
});
it('does not follow a credential-bearing redirect', async () => {
  const response = await forwardGitHub(
    new Request('http://github.com/org/course.git/info/refs?service=git-upload-pack'),
    { repository: 'org/course', GITHUB_CLIENT_TOKEN: 'fake-shared-client-token' },
    async () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } }),
  );
  expect(response.status).toBe(502);
});
it('limits model credential injection to the inference endpoints', async () => {
  const response = await forwardOpenAI(
    new Request('http://openai.internal/v1/files', { method: 'POST' }),
    { CODEX_API_KEY: 'secret' },
  );
  expect(response.status).toBe(403);
});

it('rejects Git access when the shared client token is missing', async () => {
  const response = await forwardGitHub(
    new Request('http://github.com/org/course.git/info/refs?service=git-upload-pack'),
    { repository: 'org/course' },
    async () => {
      throw new Error('Must not contact GitHub without a credential');
    },
  );
  expect(response.status).toBe(503);
});

const env = { CODEX_API_KEY: 'secret', CODEX_MODEL: 'configured-model' };
const request = (body: object, path = '/v1/responses') =>
  new Request('http://openai.internal' + path, {
    method: 'POST',
    headers: { 'OpenAI-Project': 'attacker', 'X-Secret': 'private' },
    body: JSON.stringify({ model: env.CODEX_MODEL, ...body }),
  });
it.each([
  { model: 'other' },
  { tools: [{ type: 'web_search' }] },
  { previous_response_id: 'resp-old' },
  { input: [{ type: 'input_image', image_url: 'https://changing.example/image' }] },
])('refuses unbounded inference before any provider call: %j', async (body) => {
  let calls = 0;
  const result = await forwardOpenAI(request(body), env, async () => {
    calls++;
    return new Response();
  });
  expect(result.status).toBe(403);
  expect(calls).toBe(0);
});
it('pauses native compaction without contacting the provider', async () => {
  let calls = 0;
  const result = await forwardOpenAI(request({}, '/v1/responses/compact'), env, async () => {
    calls++;
    return new Response();
  });
  expect(result.status).toBe(429);
  expect(calls).toBe(0);
});
it('caps output before inference, strips sandbox headers and settles streamed usage', async () => {
  const settlements: unknown[] = [];
  const calls: Request[] = [];
  const control = {
    async check() {},
    async reserve(details: { inputTokenUpperBound: number }) {
      expect(details.inputTokenUpperBound).toBe(100);
      return {
        reservationId: crypto.randomUUID(),
        maxOutputTokens: 123,
        reservedCostUnits: 999,
        expiresAt: Date.now() + 120000,
      };
    },
    async dispatch() {
      return true;
    },
    async settle(value: unknown) {
      settlements.push(value);
    },
  };
  const result = await forwardOpenAI(
    request({ stream: true, max_output_tokens: 1000 }),
    env,
    async (input) => {
      const sent = input as Request;
      calls.push(sent);
      if (sent.url.endsWith('/input_tokens')) return Response.json({ input_tokens: 100 });
      expect(await sent.clone().json()).toMatchObject({
        max_output_tokens: 123,
        store: false,
        service_tier: 'default',
      });
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: {
              id: 'resp-1',
              usage: {
                input_tokens: 100,
                output_tokens: 50,
                input_tokens_details: { cached_tokens: 20 },
              },
            },
          }) +
          '\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    },
    control,
  );
  expect(result.status).toBe(200);
  await result.text();
  expect(calls).toHaveLength(2);
  expect(calls[1].headers.get('Authorization')).toBe('Bearer secret');
  expect(calls[1].headers.get('OpenAI-Project')).toBeNull();
  expect(calls[1].headers.get('X-Secret')).toBeNull();
  expect(settlements).toMatchObject([
    { kind: 'measured', responseId: 'resp-1', usage: { input: 100, cached: 20, output: 50 } },
  ]);
});
it('blocks dispatch on denied capacity and charges ambiguous provider failure conservatively', async () => {
  let inference = 0;
  const settlements: unknown[] = [];
  const send: typeof fetch = async (input) => {
    if ((input as Request).url.endsWith('/input_tokens')) {
      return Response.json({ input_tokens: 100 });
    }
    inference++;
    throw new Error('connection lost after sending');
  };
  const control = {
    async check() {},
    async reserve() {
      return {
        reservationId: crypto.randomUUID(),
        maxOutputTokens: 16,
        reservedCostUnits: 1000,
        expiresAt: Date.now() + 120000,
      };
    },
    async dispatch() {
      return true;
    },
    async settle(value: unknown) {
      settlements.push(value);
    },
  };
  const result = await forwardOpenAI(request({}), env, send, control);
  expect(result.status).toBe(502);
  expect(inference).toBe(1);
  expect(settlements).toMatchObject([{ kind: 'unknown' }]);
  settlements.length = 0;
  const notSent = await forwardOpenAI(request({}), env, send, {
    ...control,
    async dispatch() {
      return false;
    },
  });
  expect(notSent.status).toBe(429);
  expect(inference).toBe(1);
  expect(settlements).toMatchObject([{ kind: 'not_sent' }]);
});
