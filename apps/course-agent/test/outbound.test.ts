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

it.each(['/v1/responses', '/v1/responses/compact'])(
  'enforces the model and removes hosted tools on %s',
  async (path) => {
    let captured: Request | undefined;
    const env = { CODEX_API_KEY: 'secret', CODEX_MODEL: 'configured-model' };
    const send: typeof fetch = async (request) => {
      captured = request as Request;
      return new Response('ok');
    };
    const request = (model: string) =>
      new Request(`http://openai.internal${path}`, {
        method: 'POST',
        body: JSON.stringify({
          model,
          tools: [
            { type: 'web_search' },
            { type: 'mcp', server_url: 'https://external.test' },
            { type: 'function', name: 'push_sync' },
            { type: 'custom', name: 'apply_patch' },
          ],
          tool_choice: 'auto',
        }),
      });
    expect((await forwardOpenAI(request('expensive-other-model'), env, send)).status).toBe(403);
    expect(captured).toBeUndefined();
    expect((await forwardOpenAI(request('configured-model'), env, send)).status).toBe(200);
    expect(await captured!.json()).toMatchObject({
      tools: [
        { type: 'function', name: 'push_sync' },
        { type: 'custom', name: 'apply_patch' },
      ],
    });
  },
);
it('rejects malformed JSON and forced provider tools before credential injection', async () => {
  const env = { CODEX_API_KEY: 'secret', CODEX_MODEL: 'configured-model' };
  for (const body of [
    'invalid',
    JSON.stringify({ model: env.CODEX_MODEL, tool_choice: { type: 'web_search' } }),
  ]) {
    const response = await forwardOpenAI(
      new Request('http://openai.internal/v1/responses', { method: 'POST', body }),
      env,
      async () => {
        throw new Error('Must not forward forbidden requests');
      },
    );
    expect([400, 403]).toContain(response.status);
  }
});
